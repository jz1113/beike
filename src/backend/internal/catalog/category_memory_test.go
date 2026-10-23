package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestObserveHonorsBudgetBelowThresholdAndRemembersRejections(t *testing.T) {
	root, _ := filepath.Abs("../../../..")
	path := filepath.Join(t.TempDir(), "memory.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`); err != nil {
		t.Fatal(err)
	}
	folder := "prompt_subcategory:digital_3c:phone"
	for i := 0; i < 4; i++ {
		images, shots := []string{}, []map[string]any{}
		for n := 1; n <= 4; n++ {
			images = append(images, fmt.Sprintf("https://example.com/%d-%d.jpg", i, n))
			shots = append(shots, map[string]any{"prompt": "完整逐镜反推词", "shot_no": n})
		}
		rawImages, _ := json.Marshal(images)
		rawShots, _ := json.Marshal(shots)
		_, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","title","reversePromptZh","sourceImages","sourceImageIndices","shotPromptsJson","productCategoryIds","productSubcategory","groupIndex","updatedAt") VALUES (?,'a','图组','反推',?,'[1,2,3,4]',?,'["digital_3c"]','phone',1,CURRENT_TIMESTAMP)`, fmt.Sprintf("g%d", i), string(rawImages), string(rawShots))
		if err != nil {
			t.Fatal(err)
		}
	}
	dataset, err := learning.LoadDataset(context.Background(), db, "a", folder)
	if err != nil {
		t.Fatal(err)
	}
	for i := range dataset.Samples {
		dataset.Samples[i].Role = "training"
	}
	if err := learning.SaveRoles(context.Background(), db, "a", folder, dataset.Samples); err != nil {
		t.Fatal(err)
	}
	calls := 0
	old := styleHTTP
	t.Cleanup(func() { styleHTTP = old })
	styleHTTP = func() *http.Client {
		return &http.Client{Transport: learningTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			output := map[string]any{"compatible": false, "reason": "主体不属于当前细分"}
			if calls > 1 {
				shots := []map[string]any{}
				for n := 1; n <= 4; n++ {
					shots = append(shots, map[string]any{"shot": n, "visual": "可见纹理", "replacement": "保持接触与裁切"})
				}
				output = map[string]any{"compatible": true, "observations": shots, "reusableRules": []string{"保留原图关系"}, "conditions": []string{"手持时"}, "failuresToAvoid": []string{"勿虚构结构"}}
			}
			raw, _ := json.Marshal(output)
			body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(raw)}}}})
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}, nil
		})}
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	call := func(action string, force bool, want int) string {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"folderId": folder, "model": "mock-vision", "customBaseUrl": "https://example.com", "customApiKey": "test-key", "textProtocol": "openai", "force": force, "maxNewSamples": 1})
		r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action="+action, bytes.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "a"))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
		}
		return w.Body.String()
	}
	call("observe", true, 200)
	call("observe", false, 409)
	if calls != 1 {
		t.Fatal("unchanged input automatically replayed")
	}
	body := call("learn", true, 200)
	if calls != 2 || !strings.Contains(body, `"stage":"observed"`) {
		t.Fatal("call budget exceeded or premature candidate")
	}
	dataset, _ = learning.LoadDataset(context.Background(), db, "a", folder)
	memory, err := learning.ReadMemory(context.Background(), db, "a", folder, dataset)
	if err != nil || memory.Learned != 1 || memory.Rejected != 1 || memory.Pending != 2 {
		t.Fatalf("partial memory lost %#v %v", memory, err)
	}
	versions, _ := learning.Versions(context.Background(), db, "a", folder)
	if len(versions) != 0 {
		t.Fatal("candidate created without enough observed evidence")
	}
	if _, err := db.Exec(`DROP TABLE "CategorySkillSampleRole"`); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/catalog/category-skills?folderId="+folder, nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "a"))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 500 || strings.Contains(w.Body.String(), "SQL") || strings.Contains(w.Body.String(), "CategorySkillSampleRole") {
		t.Fatal("internal SQL error exposed or misreported as user input error")
	}
}

func TestConsolidationContinuesDraftAndRetrievesUnincorporatedMemoriesFirst(t *testing.T) {
	samples, sources := []learning.Sample{}, []map[string]any{}
	for i := 0; i < 40; i++ {
		id := fmt.Sprintf("g%02d", i)
		samples = append(samples, learning.Sample{ID: id, Fingerprint: id, Role: "training"})
		sources = append(sources, map[string]any{"groupId": id})
	}
	versions := []learning.Version{{ID: "draft", ParentVersionID: "active", PromptSnippet: "已积累但尚未发布的方法", Manifest: learning.Manifest{Samples: samples[:30]}}, {ID: "active", PromptSnippet: "旧方法", Manifest: learning.Manifest{Samples: samples[:20]}}}
	previous, inherited := categoryParent(versions, "active", learning.Dataset{Samples: samples}, learning.Memory{})
	if previous != versions[0].PromptSnippet || len(inherited) != 30 {
		t.Fatal("unpublished memory discarded")
	}
	selected := selectCategorySources(sources, inherited)
	if len(selected) != 30 || selected[0]["groupId"] != "g30" || selected[9]["groupId"] != "g39" {
		t.Fatal("new cached observations hidden by the first thirty old groups")
	}
}
