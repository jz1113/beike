package workshop

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestBatchEventStartsCollection(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "events.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE WorkshopBatch (id TEXT, workspaceId TEXT, name TEXT, status TEXT, revision INTEGER, snapshotJson TEXT, createdAt TEXT, updatedAt TEXT, legacyRecovered INTEGER)`,
		`CREATE TABLE WorkshopBatchState (id TEXT, workspaceId TEXT PRIMARY KEY, activeBatchId TEXT, legacyMigratedAt TEXT)`,
		`CREATE TABLE WorkshopWorkspace (id TEXT, workspaceId TEXT, snapshotJson TEXT)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	snapshot := `{"items":[],"pipeline":{"status":"draft"}}`
	if _, err := db.Exec(`INSERT INTO WorkshopBatch (id, workspaceId, name, status, revision, snapshotJson, createdAt, updatedAt, legacyRecovered) VALUES ('batch_active','local','当前','draft',1,?,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0)`, snapshot); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO WorkshopBatchState (id, workspaceId, activeBatchId, legacyMigratedAt) VALUES ('local','local','batch_active','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/workshop-batches/batch_active/events", bytes.NewBufferString(`{"revision":1,"event":{"type":"START_COLLECTION"}}`))
	request.SetPathValue("id", "batch_active")
	response := httptest.NewRecorder()
	BatchEvent(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"status":"collecting"`)) {
		t.Fatalf("event %d %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodPost, "/api/catalog/workshop-batches/batch_active/events", bytes.NewBufferString(`{"revision":2,"event":{"type":"START_GENERATION","runId":"run-1"}}`))
	request.SetPathValue("id", "batch_active")
	response = httptest.NewRecorder()
	BatchEvent(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("illegal %d %s", response.Code, response.Body.String())
	}
}
