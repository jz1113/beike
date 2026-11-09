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
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
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

func TestLearningReviewUsesFrozenAttemptNotCurrentProductSkill(t *testing.T) {
	raw := `{"items":[{"id":"p","appliedSkillSnapshot":{"learningVersionId":"newer-version"},"tasks":[{"id":"task","status":"SUCCESS","resultUrl":"https://example.com/result","idempotencyKey":"generation:a0","shot_no":1,"outputSize":"1536x2048","generationSize":"1536x2048","learningContext":{"scopeId":"folder","versionId":"candidate","groupId":"reference","referenceFingerprint":"four-source-images-and-prompts","baseRecipeVersion":"base","productImages":["https://example.com/product"],"referenceImage":"https://example.com/original","model":"image-model","aspectRatio":"3:4","quality":"high","strategy":"single_shot","anchorFaceUrl":"","replacements":["","",""]}}]}]}`
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		t.Fatal(err)
	}
	score := 90
	review := dbworkshop.OutputReview{BatchID: "batch", TaskID: "task", Decision: "accepted", Fidelity: &score, Composition: &score, Aesthetic: &score, Consistency: &score}
	folder, first := learningReview(snapshot, review)
	if folder != "folder" || first.VersionID != "candidate" || first.TaskID != "batch:generation:a0" || first.Evidence["resultImage"] != "https://example.com/result" || len(first.Scores) != 4 {
		t.Fatal("missing frozen generation evidence")
	}
	task := snapshot["items"].([]any)[0].(map[string]any)["tasks"].([]any)[0].(map[string]any)
	context := task["learningContext"].(map[string]any)
	context["versionId"] = ""
	_, control := learningReview(snapshot, review)
	if first.ComparisonKey != control.ComparisonKey {
		t.Fatal("same product/reference/settings not paired")
	}
	context["model"] = "different-model"
	_, changed := learningReview(snapshot, review)
	if changed.ComparisonKey == control.ComparisonKey {
		t.Fatal("different models paired")
	}
	context["model"] = "image-model"
	task["outputSize"] = "1024x1024"
	_, changed = learningReview(snapshot, review)
	if changed.ComparisonKey == control.ComparisonKey {
		t.Fatal("different output dimensions paired")
	}
	task["idempotencyKey"] = "generation:a1"
	_, retry := learningReview(snapshot, review)
	if retry.TaskID == first.TaskID {
		t.Fatal("retry overwrote previous attempt rating")
	}
	task["resultStatus"] = "superseded"
	if folder, _ := learningReview(snapshot, review); folder != "" {
		t.Fatal("obsolete output entered feedback pool")
	}
}

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
