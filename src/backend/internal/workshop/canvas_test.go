package workshop

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
)

func canvasTestDB(t *testing.T) (*sql.DB, config.Config) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "canvas.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE WorkshopBatch (id TEXT PRIMARY KEY, workspaceId TEXT, name TEXT, status TEXT, revision INTEGER, snapshotJson TEXT, createdAt TEXT, updatedAt TEXT, legacyRecovered INTEGER)`,
		`CREATE TABLE WorkshopBatchState (id TEXT, workspaceId TEXT PRIMARY KEY, activeBatchId TEXT, legacyMigratedAt TEXT)`,
		`CREATE TABLE WorkshopWorkspace (id TEXT, workspaceId TEXT, snapshotJson TEXT)`,
		`CREATE TABLE WorkshopPipelineRun (workspaceId TEXT, batchId TEXT)`,
		`CREATE TABLE WorkshopOutputReview (id TEXT, workspaceId TEXT, batchId TEXT, productId TEXT, taskId TEXT, decision TEXT, productFidelityScore INTEGER, compositionScore INTEGER, aestheticScore INTEGER, consistencyScore INTEGER, reasonCodesJson TEXT, note TEXT, createdAt TEXT)`,
		`CREATE TABLE PromptAssetUsageEvent (id TEXT, workspaceId TEXT, assetId TEXT, batchId TEXT, productId TEXT, taskId TEXT, eventType TEXT, createdAt TEXT, metadata TEXT)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { db.Close() })
	return db, config.Config{DatabaseURL: "file:" + path}
}

func TestCanvasBatchCopyIsIndependentIdempotentAndWorkspaceScoped(t *testing.T) {
	db, _ := canvasTestDB(t)
	ctx := context.Background()
	legacy, err := dbworkshop.EnsureActiveWorkshopBatch(ctx, db, "local")
	if err != nil {
		t.Fatal(err)
	}
	snapshot := `{"version":2,"items":[{"id":"product","status":"success","tasks":[{"id":"task","status":"IN_PROGRESS","idempotencyKey":"original-key","upstreamTaskId":"upstream","resultUrl":"/saved.png"}]}],"settings":{"selectedShotCount":4},"pipeline":{"status":"generating"}}`
	if _, err := db.Exec(`UPDATE WorkshopBatch SET snapshotJson=? WHERE id=?`, snapshot, legacy.ID); err != nil {
		t.Fatal(err)
	}
	copy, err := dbworkshop.CreateCanvasWorkshopBatch(ctx, db, "local", "project-a", legacy.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	again, err := dbworkshop.CreateCanvasWorkshopBatch(ctx, db, "local", "project-a", "missing", "")
	if err != nil || again.ID != copy.ID {
		t.Fatalf("retry copied twice: %#v %v", again, err)
	}
	if !strings.Contains(copy.Snapshot, "original-key") || !strings.Contains(copy.Snapshot, "upstream") || !strings.Contains(copy.Snapshot, "/saved.png") {
		t.Fatal("copy lost task recovery or saved media")
	}
	other, err := dbworkshop.CreateCanvasWorkshopBatch(ctx, db, "local", "project-b", "", "")
	if err != nil || other.ID == copy.ID {
		t.Fatal("projects share a batch", err)
	}
	if _, err := dbworkshop.CreateCanvasWorkshopBatch(ctx, db, "other", "project-a", legacy.ID, ""); err == nil {
		t.Fatal("copied another workspace")
	}
	if _, _, err := dbworkshop.WriteWorkshopBatch(ctx, db, "local", copy.ID, copy.Revision, `{"items":[]}`, "draft"); err != nil {
		t.Fatal("independent save rejected", err)
	}
	if _, _, err := dbworkshop.WriteWorkshopBatch(ctx, db, "local", copy.ID, copy.Revision, `{}`, "draft"); err == nil {
		t.Fatal("stale revision overwritten")
	}
	active, err := dbworkshop.ReadActiveWorkshopBatch(ctx, db, "local")
	if err != nil || active.ID != legacy.ID || active.Snapshot != snapshot {
		t.Fatal("legacy draft changed", err)
	}
	if _, err := dbworkshop.ClearWorkshopHistory(ctx, db, "local", legacy.ID); err != nil {
		t.Fatal(err)
	}
	kept, err := dbworkshop.GetWorkshopBatch(ctx, db, "local", copy.ID)
	if err != nil || kept.ID == "" {
		t.Fatal("legacy clear deleted canvas data", err)
	}
}

func TestCanvasReviewUsesExplicitOwnedBatch(t *testing.T) {
	db, cfg := canvasTestDB(t)
	ctx := context.Background()
	if _, err := dbworkshop.EnsureActiveWorkshopBatch(ctx, db, "local"); err != nil {
		t.Fatal(err)
	}
	batch, err := dbworkshop.CreateCanvasWorkshopBatch(ctx, db, "local", "project", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE WorkshopBatch SET snapshotJson=? WHERE id=?`, `{"items":[{"id":"product","tasks":[{"id":"task"}]}]}`, batch.ID); err != nil {
		t.Fatal(err)
	}
	for _, workspace := range []string{"local", "other"} {
		request := httptest.NewRequest(http.MethodPost, "/review", strings.NewReader(`{"decision":"accepted","batchId":"`+batch.ID+`"}`))
		request.SetPathValue("taskId", "task")
		request = request.WithContext(httpx.WithWorkspace(ctx, workspace))
		response := httptest.NewRecorder()
		Review(cfg).ServeHTTP(response, request)
		want := http.StatusOK
		if workspace == "other" {
			want = http.StatusNotFound
		}
		if response.Code != want {
			t.Fatalf("review workspace %s: %d %s", workspace, response.Code, response.Body.String())
		}
	}
	var recorded string
	if err := db.QueryRow(`SELECT batchId FROM WorkshopOutputReview LIMIT 1`).Scan(&recorded); err != nil || recorded != batch.ID {
		t.Fatal("review belongs to wrong batch", err)
	}
}

func TestCreateCanvasBatchAPIValidatesAndRetries(t *testing.T) {
	_, cfg := canvasTestDB(t)
	var id string
	for i := 0; i < 2; i++ {
		response := httptest.NewRecorder()
		CreateBatch(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/batches", strings.NewReader(`{"canvasProjectId":"project-api"}`)))
		var data struct {
			Batch struct {
				ID string `json:"id"`
			} `json:"batch"`
		}
		_ = json.Unmarshal(response.Body.Bytes(), &data)
		if response.Code != http.StatusCreated || data.Batch.ID == "" || i > 0 && data.Batch.ID != id {
			t.Fatalf("create: %d %s", response.Code, response.Body.String())
		}
		id = data.Batch.ID
	}
	response := httptest.NewRecorder()
	CreateBatch(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/batches", strings.NewReader(`{"canvasProjectId":"../bad"}`)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid project: %d", response.Code)
	}
}
