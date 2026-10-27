package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestCategorySkillBackgroundRunSurvivesClosedRequest(t *testing.T) {
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
	if _, err := db.Exec(`INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","workspaceId") VALUES ('digital_3c','手机通讯','official')`); err != nil {
		t.Fatal(err)
	}
	folder := "prompt_subcategory:digital_3c:phone"
	for i := 0; i < 6; i++ {
		images, shots := []string{}, []map[string]any{}
		for n := 1; n <= 4; n++ {
			images = append(images, "https://example.com/background-"+itoaCatalog(i)+"-"+itoaCatalog(n)+".jpg")
			shots = append(shots, map[string]any{"shot_no": n, "prompt": "手机实拍"})
		}
		rawImages, _ := json.Marshal(images)
		rawShots, _ := json.Marshal(shots)
		if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","title","reversePromptZh","sourceImages","sourceImageIndices","shotPromptsJson","productCategoryIds","productSubcategory","groupIndex","updatedAt") VALUES (?,'a','图组','反推',?,'[1,2,3,4]',?,'["digital_3c"]','phone',1,CURRENT_TIMESTAMP)`, i, string(rawImages), string(rawShots)); err != nil {
			t.Fatal(err)
		}
	}
	old := styleHTTP
	t.Cleanup(func() { styleHTTP = old })
	styleHTTP = func() *http.Client {
		return &http.Client{Transport: learningTransport(func(r *http.Request) (*http.Response, error) {
			body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": `{"compatible":false,"reason":"后台测试样本不适用"}`}}}})
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}, nil
		})}
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	body, _ := json.Marshal(map[string]any{"folderId": folder, "model": "mock-vision", "customBaseUrl": "https://example.com", "customApiKey": "test-key", "textProtocol": "openai", "background": true, "force": true, "maxNewSamples": 1})
	ctx, cancel := context.WithCancel(httpx.WithWorkspace(context.Background(), "a"))
	r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action=observe", bytes.NewReader(body)).WithContext(ctx)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	cancel()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		scope, err := learning.ReadScope(context.Background(), db, "a", folder)
		if err != nil {
			t.Fatal(err)
		}
		if scope.RunningToken == "" {
			if scope.Error != "" {
				t.Fatalf("background run failed: %s", scope.Error)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("background run did not finish after request context was canceled")
}
