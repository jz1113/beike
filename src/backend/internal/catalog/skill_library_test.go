package catalog

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestSkillLibraryHTTPUnifiesSourcesWithoutChangingOfficialRows(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "skills.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	handler := Skills(config.Config{Root: root, DatabaseURL: "file:" + path})
	call := func(workspace, method, url string, payload any, status int) map[string]any {
		t.Helper()
		body, _ := json.Marshal(payload)
		r := httptest.NewRequest(method, url, bytes.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != status {
			t.Fatalf("%s %s status %d: %s", method, url, w.Code, w.Body.String())
		}
		var data map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
			t.Fatal(err)
		}
		return data
	}
	doc := map[string]any{"id": "my-skill", "name": "助手技能", "description": "说明", "prompt": "完整规则", "files": []any{map[string]any{"path": "refs/a.md", "content": "完整资料"}}}
	created := call("a", http.MethodPost, "/api/catalog/skills", map[string]any{"skill": doc}, 200)["skill"].(map[string]any)
	items := call("a", http.MethodGet, "/api/catalog/skills", nil, 200)["skills"].([]any)
	assistantCount, workshopCount := 0, 0
	for _, value := range items {
		entry := value.(map[string]any)
		content := entry["content"].(map[string]any)
		if content["libraryVersion"] == "" || content["libraryVersion"] == nil {
			t.Fatal("missing content version")
		}
		if entry["kind"] == "assistant" {
			assistantCount++
		} else {
			workshopCount++
		}
	}
	if assistantCount != 1 || workshopCount != 0 {
		t.Fatalf("counts assistant=%d workshop=%d", assistantCount, workshopCount)
	}
	call("a", http.MethodPost, "/api/catalog/skills?action=favorite", map[string]any{"kind": "assistant", "id": "my-skill", "isFavorite": true}, 200)
	items = call("a", http.MethodGet, "/api/catalog/skills", nil, 200)["skills"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["content"].(map[string]any)["isFavorite"] != true {
		t.Fatal("favorite did not update assistant skill")
	}
	other := call("b", http.MethodGet, "/api/catalog/skills", nil, 200)["skills"].([]any)
	if len(other) != 0 {
		t.Fatal("assistant document leaked to another workspace")
	}
	doc["prompt"] = "新规则"
	call("a", http.MethodPut, "/api/catalog/skills", map[string]any{"skill": doc, "expectedVersion": created["libraryVersion"]}, 200)
	call("a", http.MethodPut, "/api/catalog/skills", map[string]any{"skill": doc, "expectedVersion": created["libraryVersion"]}, 409)
	call("b", http.MethodDelete, "/api/catalog/skills?id=my-skill&version="+created["libraryVersion"].(string), nil, 409)
	doc["files"] = map[string]any{"bad": true}
	call("a", http.MethodPost, "/api/catalog/skills", map[string]any{"skill": doc}, 400)
}
