package catalog

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestCategorySkillEditRequiresRevisionAndKeepsWorkspaceIsolated(t *testing.T) {
	root, _ := filepath.Abs("../../../..")
	path := filepath.Join(t.TempDir(), "skills.db")
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
	ctx := context.Background()
	if err := learning.EnsureScope(ctx, db, "a", folder); err != nil {
		t.Fatal(err)
	}
	token, err := learning.BeginRun(ctx, db, "a", folder, "seed", true)
	if err != nil {
		t.Fatal(err)
	}
	id, err := learning.SaveVersion(ctx, db, "a", folder, token, learning.Version{PromptSnippet: "原版技能"})
	if err != nil {
		t.Fatal(err)
	}
	if err := learning.FinishRun(ctx, db, "a", folder, token, ""); err != nil {
		t.Fatal(err)
	}
	handler := CategorySkills(config.Config{Root: root, DatabaseURL: "file:" + path})
	call := func(workspace string, revision any, want int) string {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"folderId": folder, "versionId": id, "revision": revision, "promptSnippet": "修改后的技能", "summary": "自然光"})
		r := httptest.NewRequest(http.MethodPost, "/api/catalog/category-skills?action=edit", bytes.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
		}
		return w.Body.String()
	}
	call("a", nil, 400)
	call("a", 0.5, 400)
	call("b", 0, 409)
	var result struct {
		Success   bool   `json:"success"`
		VersionID string `json:"versionId"`
	}
	if err := json.Unmarshal([]byte(call("a", 0, 200)), &result); err != nil || !result.Success || result.VersionID == "" || result.VersionID == id {
		t.Fatalf("missing new version: %#v %v", result, err)
	}
	call("a", 0, 409)
	version, err := learning.ReadVersion(ctx, db, "a", folder, result.VersionID)
	if err != nil || version.PromptSnippet != "修改后的技能" || version.Summary != "自然光" {
		t.Fatalf("edit not persisted: %#v %v", version, err)
	}
	scope, err := learning.ReadScope(ctx, db, "a", folder)
	if err != nil || scope.ActiveVersionID != "" || scope.TrialVersionID != "" || scope.Revision != 1 {
		t.Fatalf("edit changed production: %#v %v", scope, err)
	}
}
