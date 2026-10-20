package library

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestDeconstructRequestCompletesInGo(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	vision := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("vision path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": `{"per_image":[{"image_index":1,"reverse_prompt_zh":"白底","has_human":false,"title":"图"}],"content_summary":"测试","theme_category":"general"}`}}},
		})
	}))
	defer vision.Close()
	dbPath := filepath.Join(t.TempDir(), "review.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructReview" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "albumName" TEXT, "payload" TEXT, "status" TEXT, "createdAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development", DatabaseURL: "file:" + dbPath}
	body := `{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"customApiKey":"secret","customBaseUrl":"` + vision.URL + `","model":"gpt-5.6-luna","reviewBeforeSave":true,"clientTaskId":"task-1"}`
	response := httptest.NewRecorder()
	deconstructRequestHandler(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(body)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"success":true`) || !strings.Contains(response.Body.String(), `"reviewStatus":"pending"`) {
		t.Fatalf("deconstruct %d %s", response.Code, response.Body.String())
	}
	progress := httptest.NewRecorder()
	deconstructProgressHandler(cfg).ServeHTTP(progress, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/deconstruct/progress?clientTaskId=task-1", nil))
	if progress.Code != http.StatusOK || !strings.Contains(progress.Body.String(), `"stage":"completed"`) {
		t.Fatalf("progress %d %s", progress.Code, progress.Body.String())
	}
}

func TestDeconstructJobSubmitDoesNotProxy(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	dbPath := filepath.Join(t.TempDir(), "jobs.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructJob" (
		"id" TEXT, "workspaceId" TEXT, "jobId" TEXT, "inputHash" TEXT, "status" TEXT, "configJson" TEXT,
		"concurrency" INTEGER, "reviewBeforeSave" INTEGER, "stopRequested" INTEGER, "error" TEXT,
		"createdAt" TEXT, "updatedAt" TEXT, "finishedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructJobItem" (
		"id" TEXT, "workspaceId" TEXT, "jobId" TEXT, "itemId" TEXT, "position" INTEGER, "inputJson" TEXT,
		"status" TEXT, "progressJson" TEXT, "resultJson" TEXT, "error" TEXT, "startedAt" TEXT,
		"dispatchedAt" TEXT, "finishedAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development", DatabaseURL: "file:" + dbPath}
	body := `{"jobId":"job-1","overrides":{"textProtocol":"anthropic"},"items":[{"id":"a","name":"套组","images":["https://127.0.0.1:1/a.jpg"]}]}`
	response := httptest.NewRecorder()
	deconstructJobsPostHandler(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct/jobs", strings.NewReader(body)))
	if response.Code != http.StatusAccepted || !strings.Contains(response.Body.String(), `"jobId":"job-1"`) {
		t.Fatalf("submit %d %s", response.Code, response.Body.String())
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		read, err := database.OpenWrite(dbPath)
		if err != nil {
			t.Fatal(err)
		}
		var status, storedConfig string
		err = read.QueryRow(`SELECT "status", "configJson" FROM "DeconstructJob" WHERE "jobId" = 'job-1'`).Scan(&status, &storedConfig)
		if err == nil && !strings.Contains(storedConfig, `"textProtocol":"anthropic"`) {
			t.Fatalf("async protocol lost: %s", storedConfig)
		}
		_ = read.Close()
		if err == nil && status == "failed" {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("job did not finish without replaying a paid call")
}
