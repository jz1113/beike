package library

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestBackgroundDeconstructPreservesNativeProtocol(t *testing.T) {
	var claudeCalls, geminiCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/messages":
			claudeCalls.Add(1)
			if r.Header.Get("x-api-key") != "claude-key" {
				t.Error("Claude job credentials mixed")
			}
			_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"{\"per_image\":[{\"image_index\":1,\"title\":\"图\",\"reverse_prompt_zh\":\"白底\",\"has_human\":false}]}"}],"stop_reason":"end_turn"}`))
		case "/v1beta/models/custom-vision:generateContent":
			geminiCalls.Add(1)
			if r.Header.Get("x-goog-api-key") != "gemini-key" {
				t.Error("Gemini job credentials mixed")
			}
			_, _ = w.Write([]byte(`{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"{\"per_image\":[{\"image_index\":1,\"title\":\"图\",\"reverse_prompt_zh\":\"白底\",\"has_human\":false}]}"}]}}]}`))
		default:
			t.Errorf("background native request %s", r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	// Isolate database scheduling from protocol propagation. Both jobs deliberately
	// use the same model alias and conflicting header but different body overrides.
	for _, job := range []struct{ id, protocol, apiKey string }{
		{"claude-job", "anthropic", "claude-key"}, {"gemini-job", "gemini", "gemini-key"},
	} {
		t.Run(job.protocol, func(t *testing.T) {
			dbPath := filepath.Join(t.TempDir(), "jobs.db")
			db, err := database.OpenWrite(dbPath)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			for _, schema := range []string{
				`CREATE TABLE "DeconstructJob" ("id" TEXT, "workspaceId" TEXT, "jobId" TEXT, "inputHash" TEXT, "status" TEXT, "configJson" TEXT, "concurrency" INTEGER, "reviewBeforeSave" INTEGER, "stopRequested" INTEGER, "error" TEXT, "createdAt" TEXT, "updatedAt" TEXT, "finishedAt" TEXT)`,
				`CREATE TABLE "DeconstructJobItem" ("id" TEXT, "workspaceId" TEXT, "jobId" TEXT, "itemId" TEXT, "position" INTEGER, "inputJson" TEXT, "status" TEXT, "progressJson" TEXT, "resultJson" TEXT, "error" TEXT, "startedAt" TEXT, "dispatchedAt" TEXT, "finishedAt" TEXT, "updatedAt" TEXT)`,
			} {
				if _, err := db.Exec(schema); err != nil {
					t.Fatal(err)
				}
			}
			handler := deconstructJobsPostHandler(config.Config{DatabaseURL: "file:" + dbPath, NodeEnv: "development"})
			body := `{"jobId":"` + job.id + `","model":"custom-vision","overrides":{"textProtocol":"` + job.protocol + `"},"customBaseUrl":"` + server.URL + `","customApiKey":"` + job.apiKey + `","items":[{"id":"a","name":"图","images":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="]}]}`
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
			r.Header.Set("x-text-protocol", "openai")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, r)
			if rec.Code != 202 {
				t.Fatalf("submit %d %s", rec.Code, rec.Body.String())
			}
			deadline := time.Now().Add(3 * time.Second)
			for time.Now().Before(deadline) {
				var status, stored string
				if err := db.QueryRow(`SELECT "status","configJson" FROM "DeconstructJob" WHERE "jobId"=?`, job.id).Scan(&status, &stored); err != nil {
					t.Fatal(err)
				}
				if !strings.Contains(stored, `"textProtocol":"`+job.protocol+`"`) {
					t.Fatalf("job %s protocol lost: %s", job.id, stored)
				}
				if status == "failed" {
					t.Fatalf("job %s failed", job.id)
				}
				if status == "completed" {
					return
				}
				time.Sleep(10 * time.Millisecond)
			}
			t.Fatalf("background native job %s did not finish", job.id)
		})
	}
	if claudeCalls.Load() != 1 || geminiCalls.Load() != 1 {
		t.Fatalf("job calls Claude=%d Gemini=%d", claudeCalls.Load(), geminiCalls.Load())
	}
}
