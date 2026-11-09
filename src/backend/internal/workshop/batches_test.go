package workshop

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
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
	if response.Code != http.StatusCreated || !bytes.Contains(response.Body.Bytes(), []byte("电商图片 · ")) {
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
	body := `{"revision":1,"snapshot":{"items":[{"id":"product","tasks":[{"id":"shot","status":"IN_PROGRESS","upstreamTaskId":"same-provider-id","recordId":"original-record","idempotencyKey":"original-key","usageScope":{"workspaceId":"workspace","channelId":"channel","mediaType":"image","epoch":"original-epoch"}}]}],"pipeline":{"status":"collecting"}}}`
	request := httptest.NewRequest(http.MethodPut, "/api/catalog/workshop-batches/batch_active", bytes.NewBufferString(body))
	request.SetPathValue("id", "batch_active")
	response := httptest.NewRecorder()
	SaveBatch(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"revision":2`)) {
		t.Fatalf("save %d %s", response.Code, response.Body.String())
	}
	read := httptest.NewRecorder()
	readRequest := httptest.NewRequest(http.MethodGet, "/api/catalog/workshop-batches/batch_active", nil)
	readRequest.SetPathValue("id", "batch_active")
	Batch(cfg).ServeHTTP(read, readRequest)
	if read.Code != http.StatusOK || !bytes.Contains(read.Body.Bytes(), []byte(`"recordId":"original-record"`)) || !bytes.Contains(read.Body.Bytes(), []byte(`"epoch":"original-epoch"`)) {
		t.Fatalf("original receipt lost on restore %d %s", read.Code, read.Body.String())
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

func TestBatchStatusFallbackMatchesFourStageWorkflow(t *testing.T) {
	cases := []struct {
		snapshot map[string]any
		want     string
	}{
		{map[string]any{"items": []any{}}, "draft"},
		{map[string]any{"items": []any{map[string]any{"id": "1"}}, "currentStage": float64(1)}, "collecting"},
		{map[string]any{"items": []any{map[string]any{"id": "1"}}, "currentStage": float64(2)}, "plan_ready"},
		{map[string]any{"items": []any{map[string]any{"id": "1"}}, "currentStage": float64(3)}, "generating"},
		{map[string]any{"items": []any{map[string]any{"id": "1"}}, "currentStage": float64(4)}, "completed"},
		{map[string]any{"items": []any{map[string]any{"id": "1"}}}, "collecting"},
	}
	for _, tc := range cases {
		if got := batchStatus(tc.snapshot); got != tc.want {
			t.Fatalf("batchStatus(%v) = %q, want %q", tc.snapshot, got, tc.want)
		}
	}
}

func TestBatchSummaryExcludesObsoleteAndEphemeralResults(t *testing.T) {
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{ID: "history", Snapshot: `{"items":[{"title":" 包 ","itemId":"123456789","status":"success","selected":true,"coverImage":"/product.jpg","tasks":[{"status":"SUCCESS","resultUrl":"/new.jpg"},{"status":"SUCCESS","resultUrl":"/old.jpg","resultStatus":"superseded"},{"status":"SUCCESS","resultUrl":"blob:expired"},{"status":"FAILURE"},{"status":"PENDING"}]},{"title":"衬衫","itemId":"987654321","coverImage":"/shirt.jpg","tasks":[]}]}`})
	for key, want := range map[string]int{"itemCount": 2, "readyCount": 1, "taskCount": 4, "resultCount": 1, "failedCount": 1} {
		if got := summary[key]; got != want {
			t.Errorf("%s = %v, want %d", key, got, want)
		}
	}
	if !reflect.DeepEqual(summary["productTitles"], []string{"包", "衬衫"}) {
		t.Fatalf("titles: %v", summary["productTitles"])
	}
	if !reflect.DeepEqual(summary["productIds"], []string{"123456789", "987654321"}) {
		t.Fatalf("ids: %v", summary["productIds"])
	}
	if !reflect.DeepEqual(summary["previewImages"], []string{"/new.jpg", "/shirt.jpg"}) {
		t.Fatalf("previews: %v", summary["previewImages"])
	}
}

func TestBatchSummaryCapsPreviewsAndNeverIncludesEmbeddedImagesOrPrompts(t *testing.T) {
	items := []map[string]any{}
	for i := 0; i < 8; i++ {
		items = append(items, map[string]any{"title": "商品", "selectedProductImages": []string{"data:" + strings.Repeat("x", 1000), "blob:expired", "/thumb.jpg"}, "prompts": []string{"private prompt"}})
	}
	raw, err := json.Marshal(map[string]any{"items": items})
	if err != nil {
		t.Fatal(err)
	}
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{Snapshot: string(raw)})
	if got := len(summary["previewImages"].([]string)); got != 4 {
		t.Fatalf("preview count: %d", got)
	}
	encoded, _ := json.Marshal(summary)
	if strings.Contains(string(encoded), "data:") || strings.Contains(string(encoded), "private prompt") {
		t.Fatal("summary leaked full image data or prompts")
	}
	if summary["itemCount"] != 8 {
		t.Fatal("preview cap must not truncate items")
	}
}

func TestBatchSummaryHandlesHistoricalEmptySnapshot(t *testing.T) {
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{Snapshot: `{"items":[]}`})
	if summary["itemCount"] != 0 || summary["resultCount"] != 0 {
		t.Fatalf("summary: %v", summary)
	}
	if summary["previewImages"] == nil || summary["productTitles"] == nil {
		t.Fatal("empty lists should be JSON arrays")
	}
}

func TestBatchSummaryKeepsUncollectedInputDistinctFromEmptyDraft(t *testing.T) {
	summary := summarizeBatch(dbworkshop.WorkshopBatchRow{Snapshot: `{"items":[],"batchInputText":" 123456789 "}`})
	if summary["hasInput"] != true || summary["itemCount"] != 0 {
		t.Fatalf("summary: %v", summary)
	}
}

func TestTaskRecordsListsOnlyWorkshopImageReceipts(t *testing.T) {
	file := filepath.Join(t.TempDir(), "records.db")
	if err := migrate.Run(file, t.TempDir(), false); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", file)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO WorkshopBatch(id,workspaceId,name,status,revision,snapshotJson,createdAt,updatedAt) VALUES('batch_demo','w','示例批次','draft',1,'{"items":[{"id":"content1","title":"本批商品"}]}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range [][]string{{"grid", "w", "batch_demo:content1:1:1:hash"}, {"external", "w", "other-key"}, {"foreign", "other", "batch_demo:content1:1:1:hash"}} {
		_, err = db.Exec(`INSERT INTO ImageTask(id,workspaceId,idempotencyKey,taskId,prompt,model,status,mediaType,updatedAt) VALUES(?,?,?,?,'prompt','model','SUCCESS','image',CURRENT_TIMESTAMP)`, row[0], row[1], row[2], "channel-"+row[0])
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest("GET", "/api/workshop/task-records", nil)
	resp := httptest.NewRecorder()
	TaskRecords(config.Config{DatabaseURL: "file:" + file}).ServeHTTP(resp, req.WithContext(httpx.WithWorkspace(req.Context(), "w")))
	var body struct {
		Records []taskrecords.Record
		Total   int
	}
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &body) != nil || body.Total != 1 || body.Records[0].Name != "示例批次 · 本批商品" || body.Records[0].Status != "completed" {
		t.Fatal(resp.Code, resp.Body.String())
	}
	// Older batches may retain slices or runs even without an ImageTask receipt.
	// Do not show four duplicate grid submissions or double-count the known receipt.
	_, err = db.Exec(`UPDATE WorkshopBatch SET snapshotJson='{"items":[{"id":"content1","title":"商品","tasks":[{"id":"slice1","gridTaskKey":"old-grid","status":"SUCCESS"},{"id":"slice2","gridTaskKey":"old-grid","status":"FAILURE","error":"图片保存失败"},{"id":"known","idempotencyKey":"batch_demo:content1:1:1:hash","status":"SUCCESS"}]}],"pipeline":{"runs":[{"id":"export1","kind":"export","status":"completed","totalTasks":2,"completedTasks":2}]}}' WHERE id='batch_demo'`)
	if err != nil {
		t.Fatal(err)
	}
	resp = httptest.NewRecorder()
	TaskRecords(config.Config{DatabaseURL: "file:" + file}).ServeHTTP(resp, req.WithContext(httpx.WithWorkspace(req.Context(), "w")))
	if resp.Code != 200 || json.Unmarshal(resp.Body.Bytes(), &body) != nil || body.Total != 3 {
		t.Fatal(resp.Code, resp.Body.String())
	}
	for _, record := range body.Records {
		if record.ID == "old-grid" && (record.Status != "partial" || record.Error != "图片保存失败" || record.Created != "") {
			t.Fatal(record)
		}
	}

}

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
