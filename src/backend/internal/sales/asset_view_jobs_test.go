package sales

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func setupAssetViewJobs(t *testing.T) (config.Config, *sql.DB) {
	t.Helper()
	file := filepath.Join(t.TempDir(), "jobs.db")
	if err := migrate.Run(file, filepath.Join("..", "..", "..", ".."), false); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+file+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	return config.Config{DatabaseURL: "file:" + file}, db
}

func postAssetViewJob(t *testing.T, cfg config.Config, body map[string]any) assetViewJob {
	t.Helper()
	raw, _ := json.Marshal(body)
	request := httptest.NewRequest(http.MethodPost, "/api/sales/asset-view-jobs", bytes.NewReader(raw))
	ctx, cancel := context.WithCancel(request.Context())
	request = request.WithContext(httpx.WithWorkspace(ctx, "mine"))
	response := httptest.NewRecorder()
	AssetViewJobs(cfg)(response, request)
	cancel() // The worker must continue when the browser closes its request.
	if response.Code != http.StatusAccepted {
		t.Fatalf("post: %d %s", response.Code, response.Body.String())
	}
	var result struct {
		Job assetViewJob `json:"job"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result.Job
}

func awaitAssetViewJob(t *testing.T, cfg config.Config, db *sql.DB, id string) assetViewJob {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		job, err := loadAssetViewJob(context.Background(), db, "mine", "id", id)
		if err != nil {
			t.Fatal(err)
		}
		if !assetViewJobRunning(job) {
			// Wait until the worker released its active claim before the next retry.
			assetViewJobMu.Lock()
			active := assetViewJobActive[assetViewJobIdentity(cfg.SQLiteFile(), "mine", id)]
			assetViewJobMu.Unlock()
			if !active {
				return job
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("background task did not finish")
	return assetViewJob{}
}

func TestAssetViewJobSurvivesCallerCancellationAndSavesSameAsset(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	grid := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 900, 1200))
	body := map[string]any{
		"key": "persona-grid-cancel", "kind": "persona",
		"data":       map[string]any{"name": "人物3", "avatarUrl": "/main.jpg", "sourceImages": `["/main.jpg","/custom-front.jpg"]`, "dimensions": `{"defaultVoiceId":"voice-2","personaViews":{"main":"/main.jpg","front":"/custom-front.jpg"}}`},
		"generation": map[string]any{"model": "gpt-image-1", "customApiKey": "private-credential", "customProtocol": "openai"},
		"checkpoint": map[string]any{"resultUrl": grid},
	}
	first := postAssetViewJob(t, cfg, body)
	job := awaitAssetViewJob(t, cfg, db, first.ID)
	if job.Status != "completed" || len(job.Images) != 9 || job.AssetID == "" {
		t.Fatalf("job: %+v", job)
	}
	var rawDimensions, sourceImages, avatar string
	if err := db.QueryRow(`SELECT "dimensions","sourceImages","avatarUrl" FROM "PersonaAsset" WHERE "id"=? AND "workspaceId"='mine'`, job.AssetID).Scan(&rawDimensions, &sourceImages, &avatar); err != nil {
		t.Fatal(err)
	}
	var dimensions struct {
		DefaultVoiceID string            `json:"defaultVoiceId"`
		Views          map[string]string `json:"personaViews"`
	}
	if json.Unmarshal([]byte(rawDimensions), &dimensions) != nil || dimensions.DefaultVoiceID != "voice-2" || dimensions.Views["front"] != "/custom-front.jpg" || dimensions.Views["main"] != "/main.jpg" || len(dimensions.Views) != 10 || avatar != job.Images["face"] {
		t.Fatalf("saved asset changed existing data: %s avatar=%s", rawDimensions, avatar)
	}
	if !strings.Contains(sourceImages, job.Images["back"]) {
		t.Fatal("generated views not in library sources")
	}
	var storedGeneration string
	if err := db.QueryRow(`SELECT "generationJson" FROM "SalesAssetViewJob" WHERE "id"=?`, job.ID).Scan(&storedGeneration); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(storedGeneration, "private-credential") || strings.Contains(storedGeneration, "customApiKey") {
		t.Fatal("stored model credentials", storedGeneration)
	}
	if replay := postAssetViewJob(t, cfg, body); replay.ID != job.ID || replay.AssetID != job.AssetID {
		t.Fatal("replay created another task", replay)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "PersonaAsset" WHERE "workspaceId"='mine'`).Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate assets", count, err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/sales/asset-view-jobs?jobId="+job.ID, nil)
	request = request.WithContext(httpx.WithWorkspace(request.Context(), "other"))
	response := httptest.NewRecorder()
	AssetViewJobs(cfg)(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatal("cross-workspace job exposed", response.Body.String())
	}
}

func TestAssetViewJobCropRetryReusesSavedResultAndCannotRecreateDeletedAsset(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	source := "/storage/mine/azhuo/refs/retry-grid.png"
	body := map[string]any{
		"key": "scene-grid-retry", "kind": "scene",
		"data":       map[string]any{"title": "场景2", "coverUrl": "/scene.jpg", "dimensions": `{"sceneViews":{"main":"/scene.jpg"}}`},
		"generation": map[string]any{"model": "gpt-image-1"}, "checkpoint": map[string]any{"resultUrl": source},
	}
	first := postAssetViewJob(t, cfg, body)
	failed := awaitAssetViewJob(t, cfg, db, first.ID)
	if failed.Status != "failed" || failed.checkpoint.ResultURL != source {
		t.Fatal("lost original generation", failed)
	}
	file := filepath.Join(os.Getenv("AZHUO_CACHE_DIR"), "mine", "azhuo", "refs", "retry-grid.png")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, assetGridFixture(t, 1200, 900), 0o644); err != nil {
		t.Fatal(err)
	}
	// Retry supplies no asset data or references, and cannot change the original model.
	retry := postAssetViewJob(t, cfg, map[string]any{"key": first.Key, "kind": "scene", "assetId": first.AssetID, "data": map[string]any{}, "generation": map[string]any{"model": "different-model"}})
	complete := awaitAssetViewJob(t, cfg, db, retry.ID)
	if complete.Status != "completed" || complete.Model != "gpt-image-1" || complete.AssetID != first.AssetID {
		t.Fatal("retry did not reuse task", complete)
	}
	if _, err := db.Exec(`DELETE FROM "SceneAsset" WHERE "id"=?`, complete.AssetID); err != nil {
		t.Fatal(err)
	}
	if err := saveAssetViewJobImages(context.Background(), db, "mine", complete); err == nil {
		t.Fatal("deleted asset was silently recreated")
	}
}

func TestAssetViewJobPreservesTemplateVariablesAndModelSelection(t *testing.T) {
	payload := map[string]any{"model": "gpt-image-1", "modelSelection": "image-route-2", "customApiKey": "private-key", "customProtocol": "template", "requestTemplate": map[string]any{"submit": map[string]any{"headers": map[string]any{"x-api-key": "{{apiKey}}", "Authorization": "Bearer {{apiKey}}", "x-secret-token": "private-token"}}}}
	safe := safeAssetViewGeneration(payload)
	encoded, _ := json.Marshal(safe)
	if strings.Contains(string(encoded), "private-key") || strings.Contains(string(encoded), "private-token") || !strings.Contains(string(encoded), "x-api-key") || !strings.Contains(string(encoded), "Authorization") || !strings.Contains(string(encoded), "image-route-2") {
		t.Fatal("template variables or credentials persisted incorrectly", string(encoded))
	}
	cfg, db := setupAssetViewJobs(t)
	job, err := prepareAssetViewJob(context.Background(), cfg, db, "mine", assetViewJobRequest{Key: "selection", Kind: "scene", Data: map[string]any{"title": "场景2", "coverUrl": "/scene.jpg"}, Generation: payload})
	if err != nil || job.Model != "image-route-2" || job.Name != "场景2" {
		t.Fatal("lost model route/name", job, err)
	}
	if _, err := db.Exec(`UPDATE "SceneAsset" SET "dimensions"='{"sceneViews":{"main":"/changed.jpg"}}' WHERE "id"=?`, job.AssetID); err != nil {
		t.Fatal(err)
	}
	for _, view := range assetGridViews[job.Kind] {
		job.Images[view] = "/generated/" + view + ".jpg"
	}
	if err := saveAssetViewJobImages(context.Background(), db, "mine", job); err == nil || !strings.Contains(err.Error(), "主图已更改") {
		t.Fatal("attached stale generated views after main image changed", err)
	}
}

func TestAssetViewJobInterruptedStateAndMarkerRecoverWithoutDuplicateAsset(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	ctx := context.Background()
	body := assetViewJobRequest{Key: "orphan", Kind: "scene", Data: map[string]any{"title": "场景1", "coverUrl": "/main.jpg"}, Generation: map[string]any{"model": "gpt-image-1"}}
	job, err := prepareAssetViewJob(ctx, cfg, db, "mine", body)
	if err != nil {
		t.Fatal(err)
	}
	id := job.AssetID
	// Model a process exit just after creating the asset, before recording its ID.
	job.AssetID = ""
	if err := persistAssetViewJob(ctx, db, "mine", &job); err != nil {
		t.Fatal(err)
	}
	recovered, err := prepareAssetViewJob(ctx, cfg, db, "mine", body)
	if err != nil || recovered.AssetID != id {
		t.Fatal("asset marker recovery failed", recovered, err)
	}
	assetViewJobMu.Lock()
	err = interruptOrphanAssetViewJob(ctx, db, cfg.SQLiteFile(), "mine", &recovered)
	assetViewJobMu.Unlock()
	if err != nil || recovered.Status != "failed" {
		t.Fatal("interrupted task stayed running", recovered, err)
	}
}

func TestAssetViewJobRunsConfiguredTemplateThenAutomaticallySaves(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	grid := "data:image/png;base64," + base64.StdEncoding.EncodeToString(assetGridFixture(t, 1200, 900))
	var submissions atomic.Int32
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: gridFetchTransport(func(request *http.Request) (*http.Response, error) {
			submissions.Add(1)
			if request.Method != http.MethodPost || request.URL.String() != "https://template.example.com/generate" || request.Header.Get("x-api-key") != "private-test-key" {
				t.Errorf("wrong template route or credentials: %s %s", request.Method, request.URL)
			}
			var payload map[string]any
			if json.NewDecoder(request.Body).Decode(&payload) != nil || payload["model"] != "gpt-image-1" || payload["prompt"] == "user-supplied-ignored" {
				t.Errorf("wrong grid generation payload: %+v", payload)
			}
			body, _ := json.Marshal(map[string]any{"image": grid})
			return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	body := map[string]any{
		"key": "configured-template", "kind": "scene",
		"data": map[string]any{"title": "场景7", "coverUrl": "/main-scene.jpg", "dimensions": `{"sceneViews":{"main":"/main-scene.jpg"}}`},
		"generation": map[string]any{"model": "gpt-image-1", "modelSelection": "configured-template-route", "prompt": "user-supplied-ignored", "customBaseUrl": "https://template.example.com", "customApiKey": "private-test-key", "customProtocol": "template", "requestTemplate": map[string]any{
			"submit": map[string]any{"url": "https://template.example.com/generate", "headers": map[string]any{"x-api-key": "{{apiKey}}"}, "body": `{"prompt":"{{prompt}}","model":"{{model}}"}`},
			"result": map[string]any{"imageUrlPath": "image"},
		}},
	}
	first := postAssetViewJob(t, cfg, body)
	job := awaitAssetViewJob(t, cfg, db, first.ID)
	if job.Status != "completed" || len(job.Images) != 9 || submissions.Load() != 1 || job.Model != "configured-template-route" {
		t.Fatalf("template task %+v submissions=%d", job, submissions.Load())
	}
	postAssetViewJob(t, cfg, body)
	if submissions.Load() != 1 {
		t.Fatal("completed task resubmitted paid generation")
	}
	var dimensions string
	if err := db.QueryRow(`SELECT "dimensions" FROM "SceneAsset" WHERE "id"=?`, job.AssetID).Scan(&dimensions); err != nil || !strings.Contains(dimensions, job.Images["detail"]) {
		t.Fatal("template result not saved", dimensions, err)
	}
}

func TestAssetViewJobRetriesFailedBaseUpdateBeforeGeneration(t *testing.T) {
	cfg, db := setupAssetViewJobs(t)
	ctx := context.Background()
	original, err := prepareAssetViewJob(ctx, cfg, db, "mine", assetViewJobRequest{Key: "original-base", Kind: "scene", Data: map[string]any{"title": "场景1", "coverUrl": "/old-main.jpg"}, Generation: map[string]any{"model": "gpt-image-1"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER "test_reject_scene_edit" BEFORE UPDATE ON "SceneAsset" BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END`); err != nil {
		t.Fatal(err)
	}
	request := assetViewJobRequest{Key: "edited-base", Kind: "scene", AssetID: original.AssetID, Data: map[string]any{"title": "场景2", "coverUrl": "/new-main.jpg"}, Generation: map[string]any{"model": "gpt-image-1"}}
	if _, err := prepareAssetViewJob(ctx, cfg, db, "mine", request); err == nil {
		t.Fatal("expected base update failure")
	}
	stored, err := loadAssetViewJob(ctx, db, "mine", "requestKey", request.Key)
	if err != nil || stored.baseSaved {
		t.Fatal("failed base marked as saved", stored, err)
	}
	if _, err := db.Exec(`DROP TRIGGER "test_reject_scene_edit"`); err != nil {
		t.Fatal(err)
	}
	request.Data = map[string]any{} // Recovery uses the durable original edit.
	recovered, err := prepareAssetViewJob(ctx, cfg, db, "mine", request)
	if err != nil || !recovered.baseSaved || recovered.AssetID != original.AssetID {
		t.Fatal("failed base not recovered", recovered, err)
	}
	var title, main string
	if err := db.QueryRow(`SELECT "title","coverUrl" FROM "SceneAsset" WHERE "id"=?`, original.AssetID).Scan(&title, &main); err != nil || title != "场景2" || main != "/new-main.jpg" {
		t.Fatal("base edits lost during recovery", title, main, err)
	}
}
