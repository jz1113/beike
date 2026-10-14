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

func TestActiveBatchCreatesDraftAndListKeepsIt(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "batches.db")
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
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	response := httptest.NewRecorder()
	ActiveBatch(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/workshop-batches/active", nil))
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("active %d %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	Batches(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/workshop-batches", nil))
	if response.Code != http.StatusOK || len(response.Body.Bytes()) == 0 {
		t.Fatalf("list %d %s", response.Code, response.Body.String())
	}
	missing := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/catalog/workshop-batches/missing", nil)
	request.SetPathValue("id", "missing")
	Batch(cfg).ServeHTTP(missing, request)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
}

func TestArchiveRejectsUnfinishedBatch(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "archive.db")
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
	if _, err := db.Exec(`INSERT INTO WorkshopBatch (id, workspaceId, name, status, revision, snapshotJson, createdAt, updatedAt, legacyRecovered) VALUES ('batch_active','local','当前','draft',1,'{"items":[{"status":"success"}]}','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO WorkshopBatchState (id, workspaceId, activeBatchId, legacyMigratedAt) VALUES ('local','local','batch_active','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	response := httptest.NewRecorder()
	ArchiveBatch(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/workshop-batches/active/archive", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusConflict || !bytes.Contains(response.Body.Bytes(), []byte("请先完成本批次")) {
		t.Fatalf("archive %d %s", response.Code, response.Body.String())
	}
}

func TestCreateBatchReusesEmptyDraft(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "create.db")
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
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	response := httptest.NewRecorder()
	CreateBatch(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/workshop-batches", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusCreated || !bytes.Contains(response.Body.Bytes(), []byte("未命名新批次")) {
		t.Fatalf("create %d %s", response.Code, response.Body.String())
	}
}

func TestSaveBatchRejectsStaleRevision(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "save.db")
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
	if _, err := db.Exec(`INSERT INTO WorkshopBatch (id, workspaceId, name, status, revision, snapshotJson, createdAt, updatedAt, legacyRecovered) VALUES ('batch_active','local','当前','draft',1,'{"items":[],"pipeline":{"status":"draft"}}','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO WorkshopBatchState (id, workspaceId, activeBatchId, legacyMigratedAt) VALUES ('local','local','batch_active','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	body := `{"revision":1,"snapshot":{"items":[],"pipeline":{"status":"collecting"}}}`
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/workshop-batches/batch_active", bytes.NewBufferString(body))
	request.SetPathValue("id", "batch_active")
	response := httptest.NewRecorder()
	SaveBatch(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"revision":2`)) {
		t.Fatalf("save %d %s", response.Code, response.Body.String())
	}
	request = httptest.NewRequest(http.MethodPut, "/api/catalog/workshop-batches/batch_active", bytes.NewBufferString(body))
	request.SetPathValue("id", "batch_active")
	response = httptest.NewRecorder()
	SaveBatch(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("stale %d %s", response.Code, response.Body.String())
	}
}

func TestDeleteHistoryRejectsActiveBatch(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "history.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE WorkshopBatch (id TEXT, workspaceId TEXT, name TEXT, status TEXT, revision INTEGER, snapshotJson TEXT, createdAt TEXT, updatedAt TEXT, legacyRecovered INTEGER)`,
		`CREATE TABLE WorkshopBatchState (id TEXT, workspaceId TEXT PRIMARY KEY, activeBatchId TEXT, legacyMigratedAt TEXT)`,
		`CREATE TABLE WorkshopWorkspace (id TEXT, workspaceId TEXT, snapshotJson TEXT)`,
		`CREATE TABLE WorkshopOutputReview (id TEXT, workspaceId TEXT, batchId TEXT)`,
		`CREATE TABLE WorkshopPipelineRun (id TEXT, workspaceId TEXT, batchId TEXT)`,
		`CREATE TABLE PromptAssetUsageEvent (id TEXT, workspaceId TEXT, batchId TEXT)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO WorkshopBatch (id, workspaceId, name, status, revision, snapshotJson, createdAt, updatedAt, legacyRecovered) VALUES ('batch_active','local','当前','draft',1,'{"items":[]}','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO WorkshopBatchState (id, workspaceId, activeBatchId, legacyMigratedAt) VALUES ('local','local','batch_active','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	request := httptest.NewRequest(http.MethodDelete, "/api/catalog/workshop-batches/batch_active", nil)
	request.SetPathValue("id", "batch_active")
	response := httptest.NewRecorder()
	DeleteBatch(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusConflict {
		t.Fatalf("active delete %d %s", response.Code, response.Body.String())
	}
}
