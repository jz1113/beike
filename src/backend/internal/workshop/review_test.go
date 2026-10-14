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

func TestReviewRecordsDecisionForActiveBatch(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "review.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	statements := []string{
		`CREATE TABLE WorkshopBatch (id TEXT, workspaceId TEXT, status TEXT, snapshotJson TEXT)`,
		`CREATE TABLE WorkshopBatchState (workspaceId TEXT PRIMARY KEY, activeBatchId TEXT)`,
		`CREATE TABLE WorkshopOutputReview (id TEXT, workspaceId TEXT, batchId TEXT, productId TEXT, taskId TEXT, decision TEXT, productFidelityScore INTEGER, compositionScore INTEGER, aestheticScore INTEGER, consistencyScore INTEGER, reasonCodesJson TEXT, note TEXT, createdAt TEXT)`,
		`CREATE TABLE PromptAssetUsageEvent (id TEXT, workspaceId TEXT, assetId TEXT, batchId TEXT, productId TEXT, taskId TEXT, eventType TEXT, createdAt TEXT, metadata TEXT)`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	snapshot := `{"items":[{"id":"product-1","selectedSceneAssetId":"scene-1","tasks":[{"id":"task-1","appliedActionId":"action-1"}]}]}`
	if _, err := db.Exec(`INSERT INTO WorkshopBatch (id, workspaceId, status, snapshotJson) VALUES ('batch-1','local','generating',?)`, snapshot); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO WorkshopBatchState (workspaceId, activeBatchId) VALUES ('local','batch-1')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	request := httptest.NewRequest(http.MethodPost, "/api/workshop/tasks/task-1/review", bytes.NewBufferString(`{"decision":"accepted","scores":{"productFidelity":90}}`))
	request.SetPathValue("taskId", "task-1")
	response := httptest.NewRecorder()
	Review(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"decision":"accepted"`)) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	missing := httptest.NewRecorder()
	missingRequest := httptest.NewRequest(http.MethodPost, "/api/workshop/tasks/other/review", bytes.NewBufferString(`{"decision":"accepted"}`))
	missingRequest.SetPathValue("taskId", "other")
	Review(cfg).ServeHTTP(missing, missingRequest)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
}
