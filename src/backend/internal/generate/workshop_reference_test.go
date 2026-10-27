package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestWorkshopAnalysisIgnoresLegacyReferenceLocks(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	path := filepath.Join(t.TempDir(), "workshop.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: "file:" + path, Root: root, NodeEnv: "development"}
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	created, err := dblibrary.CreateLibraryAsset(ctx, db, "local", "full_prompt", map[string]any{"title": "台灯桌面参考", "provenance": "manual", "sourceImages": `["https://example.com/unused.jpg","https://example.com/1.jpg","https://example.com/2.jpg","https://example.com/3.jpg","https://example.com/4.jpg"]`})
	if err != nil {
		t.Fatal(err)
	}
	var group map[string]any
	_ = json.Unmarshal(created, &group)
	originals := []any{}
	for i := 1; i <= 4; i++ {
		originals = append(originals, map[string]any{"shot_no": i, "prompt": fmt.Sprintf("完整反推词%d，木桌纹理，自然侧光", i), "shot_type": "pure_product", "has_human": false})
	}
	rawShots, _ := json.Marshal(originals)
	if _, err := db.Exec(`UPDATE "FullPromptAsset" SET "shotPromptsJson"=?, "sourceImageIndices"='[2,3,4,5]', "groupIndex"=1 WHERE "id"=?`, string(rawShots), group["id"]); err != nil {
		t.Fatal(err)
	}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		encoded, _ := json.Marshal(body)
		for _, expected := range []string{"https://example.com/product.jpg", "商品图是唯一图像输入", "创作技能"} {
			if !strings.Contains(string(encoded), expected) {
				t.Errorf("missing %s in multimodal request", expected)
			}
		}
		for _, legacy := range []string{"https://example.com/4.jpg", "完整反推词4", "木桌纹理"} {
			if strings.Contains(string(encoded), legacy) {
				t.Errorf("legacy reference leaked into production request: %s", legacy)
			}
		}
		generated := []any{}
		for i := 1; i <= 4; i++ {
			generated = append(generated, map[string]any{"shot_no": i, "prompt": fmt.Sprintf("创作成稿%d", i), "has_human": true, "shot_type": "model_shot", "sourceReferenceImageUrl": "https://example.com/4.jpg", "sourcePrompt": "旧参考词"})
		}
		text, _ := json.Marshal(map[string]any{"productFingerprint": "台灯", "prompts": generated})
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(text)}}}})
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { ModelHTTP = previous }()
	payload := map[string]any{"mode": "storyboard_generate", "shotCount": 4, "productTitle": "台灯", "imageUrls": []string{"https://example.com/product.jpg"}, "lockedAssets": map[string]any{"fullPromptId": group["id"]}, "customApiKey": "test-key", "customBaseUrl": server.URL, "groupSelectionMode": "auto"}
	post := func(workspace string) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(payload)
		request := httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(string(raw)))
		request = request.WithContext(httpx.WithWorkspace(request.Context(), workspace))
		rec := httptest.NewRecorder()
		Analyze(cfg).ServeHTTP(rec, request)
		return rec
	}
	rec := post("local")
	if rec.Code != 200 {
		t.Fatalf("analysis %d %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &result)
	prompts := workshopObjects(result["prompts"])
	if len(prompts) != 4 || prompts[3]["assembly_source"] != "skill" || prompts[3]["has_human"] != true || prompts[3]["sourceReferenceImageUrl"] != nil || prompts[3]["sourcePrompt"] != nil {
		t.Fatalf("legacy evidence or appearance overrode skill production: %#v", prompts)
	}
	foreign := post("another-workspace")
	if foreign.Code != 200 || calls != 2 {
		t.Fatalf("irrelevant legacy asset blocked another workspace: %d calls=%d", foreign.Code, calls)
	}
	if _, err := db.Exec(`UPDATE "FullPromptAsset" SET "sourceImages"='[]' WHERE "id"=?`, group["id"]); err != nil {
		t.Fatal(err)
	}
	missing := post("local")
	if missing.Code != 200 || calls != 3 {
		t.Fatalf("missing legacy originals blocked skill production: %d calls=%d", missing.Code, calls)
	}
}

func TestWorkshopImageReferenceOrderMatchesPromptNumbers(t *testing.T) {
	payload := map[string]json.RawMessage{}
	for key, value := range map[string]any{"productImageUrl": "p1", "referenceImageUrl": "p1", "productReferenceImages": []string{"p1", "p2"}, "compositionReferenceImages": []string{"s1", "s1"}, "anchorFaceImageUrl": "face"} {
		payload[key], _ = json.Marshal(value)
	}
	if got := imageReferences(payload); !reflect.DeepEqual(got, []string{"p1", "p2", "s1", "s1", "face"}) {
		t.Fatalf("reference order %v", got)
	}
	if referenceCount(payload) != 5 {
		t.Fatal("model limit check must include composition slots")
	}
}

func TestWorkshopDoesNotFillMissingModelShots(t *testing.T) {
	if _, err := finalizeWorkshopPrompts(map[string]any{"prompts": []any{}}, nil, 4); err == nil {
		t.Fatal("incomplete model response accepted")
	}
}
