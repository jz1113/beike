package workshop

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestWorkspacePutRejectsStaleRevision(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "workspace.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE WorkshopWorkspace (
		id TEXT NOT NULL,
		workspaceId TEXT NOT NULL DEFAULT 'local',
		revision INTEGER NOT NULL,
		snapshotJson TEXT NOT NULL,
		updatedAt TEXT NOT NULL,
		PRIMARY KEY (id, workspaceId)
	)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath, Root: t.TempDir()}
	body := `{"revision":0,"snapshot":{"version":1,"mode":"original","currentStage":1,"batchInputText":"","items":[],"settings":{"selectedVisionModel":"v","selectedImageGenModel":"i","selectedArchId":"a","selectedQuality":"high","selectedAspect":"3:4","selectedShotCount":4,"useAssetLibrary":true,"generationStrategy":"single_shot"}}}`
	status, payload := putWorkspace(t, cfg, body)
	if status != http.StatusOK || payload["revision"].(float64) != 1 || payload["success"] != true {
		t.Fatalf("create %d %#v", status, payload)
	}
	status, payload = putWorkspace(t, cfg, body)
	if status != http.StatusConflict || payload["code"] != "conflict" {
		t.Fatalf("conflict %d %#v", status, payload)
	}
	response := httptest.NewRecorder()
	WorkspaceGet(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/workshop-workspace?mode=original", nil))
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" || !bytes.Contains(response.Body.Bytes(), []byte(`"version":2`)) {
		t.Fatalf("read %d %s", response.Code, response.Body.String())
	}
}

func putWorkspace(t *testing.T, cfg config.Config, body string) (int, map[string]any) {
	t.Helper()
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/workshop-workspace?mode=original", bytes.NewBufferString(body))
	WorkspacePut(cfg).ServeHTTP(response, request)
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	return response.Code, payload
}
