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

type learningTransport func(*http.Request) (*http.Response, error)

func (fn learningTransport) RoundTrip(r *http.Request) (*http.Response, error) { return fn(r) }

func TestCategoryLearningContinuesAfterFailureAndReusesCompletedObservations(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "learning.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`)
	if err != nil {
		t.Fatal(err)
	}
	folder := "prompt_subcategory:digital_3c:phone"
	// Keep at least sixteen training groups after the deterministic holdout split.
	for i := 0; i < 25; i++ {
		images := []string{}
		shots := []map[string]any{}
		for n := 1; n <= 4; n++ {
			images = append(images, fmt.Sprintf("https://example.com/g%02d-%d.jpg", i, n))
			shots = append(shots, map[string]any{"shot_no": n, "prompt": "实拍手机本体与手部接触", "shot_type": "hand_held_only"})
		}
		rawImages, _ := json.Marshal(images)
		rawShots, _ := json.Marshal(shots)
		if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","title","reversePromptZh","sourceImages","sourceImageIndices","shotPromptsJson","productCategoryIds","productSubcategory","groupIndex","updatedAt") VALUES (?,'a',?,'手机本体四镜',?,'[1,2,3,4]',?,'["digital_3c"]','phone',1,CURRENT_TIMESTAMP)`, fmt.Sprintf("g%02d", i), fmt.Sprintf("组%d", i), string(rawImages), string(rawShots)); err != nil {
			t.Fatal(err)
		}
	}
	dataset, err := learning.LoadDataset(context.Background(), db, "a", folder)
	if err != nil {
		t.Fatal(err)
	}
	training, holdouts := map[string]bool{}, map[string]bool{}
	for _, s := range dataset.Samples {
		if s.Role == "training" {
			training[s.ID] = true
		} else {
			for _, image := range s.Images {
				holdouts[image] = true
			}
		}
	}
	observed := map[string]int{}
	calls := 0
	failOnce := true
	aggregated := false
	old := styleHTTP
	t.Cleanup(func() { styleHTTP = old })
	styleHTTP = func() *http.Client {
		return &http.Client{Transport: learningTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			messages := body["messages"].([]any)
			message := messages[0].(map[string]any)
			parts := message["content"].([]any)
			prompt := parts[0].(map[string]any)["text"].(string)
			for _, raw := range parts {
				part := raw.(map[string]any)
				if part["type"] == "image_url" {
					image := part["image_url"].(map[string]any)["url"].(string)
					if holdouts[image] {
						t.Fatal("held-out original was sent to learning model")
					}
				}
			}
			var material map[string]any
			split := strings.SplitN(prompt, "材料：", 2)
			if len(split) != 2 || json.Unmarshal([]byte(split[1]), &material) != nil {
				t.Fatal("missing authoritative sample descriptions")
			}
			var output map[string]any
			if id, ok := material["groupId"].(string); ok {
				if !training[id] || len(parts) != 5 {
					t.Fatalf("invalid group %s parts %d", id, len(parts))
				}
				observed[id]++
				if calls == 2 && failOnce {
					failOnce = false
					return &http.Response{StatusCode: 502, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"error":"temporary"}`))}, nil
				}
				observations := []any{}
				for n := 1; n <= 4; n++ {
					observations = append(observations, map[string]any{"shot": n, "purpose": "展示结构", "promptTemplate": "商品结构→机位→接触→场景→光影→保真", "promptExample": "@图片1保持可见轮廓，斜侧近景，置于桌面，真实接触阴影", "visual": "侧光、完整手部与自然接触阴影", "replacement": "仅换手机本体并保持占比"})
				}
				output = map[string]any{"compatible": true, "groupFramework": "整体到细节，再进入生活场景", "differenceAxes": []string{"主题与展示重点", "场景与动作关系", "开场与机位节奏"}, "observations": observations, "reusableRules": []string{"按商品原图核对结构"}, "conditions": []string{"手持时"}, "failuresToAvoid": []string{"勿磨皮或更换构图"}}
			} else {
				aggregated = true
				observations := material["observations"].([]any)
				if len(observations) != len(training) {
					t.Fatal("missing cached observations in consolidation")
				}
				evidence := []any{}
				for _, raw := range observations {
					observation := raw.(map[string]any)
					id := observation["groupId"].(string)
					if !training[id] {
						t.Fatal("holdout in consolidation")
					}
					evidence = append(evidence, map[string]any{"groupId": id, "rule": "保持主体比例和接触关系", "condition": "手持镜头"})
				}
				output = map[string]any{"promptSnippet": strings.Repeat("商品以原图为准，逐镜最小换品，保持可见纹理。", 30), "summary": "按真实观察整理条件规则，等待实际验证", "evidence": evidence}
			}
			encoded, _ := json.Marshal(output)
			response, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(encoded)}, "finish_reason": "stop"}}, "usage": map[string]any{"prompt_tokens": 10, "completion_tokens": 20}})
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(response))}, nil
		})}
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	call := func(force bool, status int) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"folderId": folder, "model": "mock-vision", "customBaseUrl": "https://example.com", "customApiKey": "test-key", "textProtocol": "openai", "force": force, "maxNewSamples": 30})
		r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action=learn", bytes.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "a"))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("status %d %s", w.Code, w.Body.String())
		}
	}
	call(true, 502)
	if calls != len(training) {
		t.Fatal("failure stopped remaining samples")
	}
	scope, err := learning.ReadScope(context.Background(), db, "a", folder)
	if err != nil || scope.Error == "" || scope.RunningToken != "" {
		t.Fatal("failed run not recoverable")
	}
	call(false, 409)
	if calls != len(training) {
		t.Fatal("ambiguous failure replayed billable calls automatically")
	}
	call(true, 200)
	if !aggregated || calls != len(training)+2 {
		t.Fatalf("partial observations not reused: calls=%d training=%d", calls, len(training))
	}
	versions, err := learning.Versions(context.Background(), db, "a", folder)
	if err != nil || len(versions) != 1 || len(versions[0].Manifest.RuleEvidence) != len(training) {
		t.Fatal("candidate evidence missing")
	}
	scope, _ = learning.ReadScope(context.Background(), db, "a", folder)
	if scope.ActiveVersionID != "" {
		t.Fatal("candidate published without actual output comparison")
	}
	call(true, 409)
	if calls != len(training)+2 {
		t.Fatal("unchanged dataset called model again")
	}
}
