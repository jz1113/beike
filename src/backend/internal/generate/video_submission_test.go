package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func videoSubmissionTestConfig(t *testing.T, server *httptest.Server) config.Config {
	t.Helper()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	path := filepath.Join(t.TempDir(), "video-receipts.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "productId" TEXT, "prompt" TEXT, "taskId" TEXT, "status" TEXT,
		"resultUrl" TEXT, "failReason" TEXT, "model" TEXT, "mediaType" TEXT, "size" TEXT, "quality" TEXT,
		"idempotencyKey" TEXT, "createdAt" TEXT, "updatedAt" TEXT
	)`)
	if err != nil {
		t.Fatal(err)
	}
	return config.Config{DatabaseURL: "file:" + path, NodeEnv: "development"}
}

func videoSubmissionTestPost(handler http.Handler, base, key, prompt, workspace string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]any{
		"prompt": prompt, "model": "veo3.1", "duration": 8, "customApiKey": "secret", "customBaseUrl": base, "clientTaskId": key,
	})
	r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body)))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	r.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func videoSubmissionTestGet(handler http.Handler, key, workspace string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskKey="+url.QueryEscape(key), nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestVideoSubmissionConcurrentClaimAndConflict(t *testing.T) {
	var calls atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	var cfg config.Config
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)
		row, err := lookupVideoSubmission(cfg, r, "concurrent")
		if err != nil || !row.found || !imageTaskStillSubmitting(row.taskID) {
			t.Errorf("receipt must be persisted before upstream request: %+v %v", row, err)
		}
		if call == 1 {
			close(started)
			<-release
		}
		_, _ = w.Write([]byte(`{"task_id":"video-original"}`))
	}))
	defer server.Close()
	cfg = videoSubmissionTestConfig(t, server)
	handler := Video(cfg)
	first := make(chan *httptest.ResponseRecorder, 1)
	go func() { first <- videoSubmissionTestPost(handler, server.URL, "concurrent", "海边", "local") }()
	<-started
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			response := videoSubmissionTestPost(handler, server.URL, "concurrent", "海边", "local")
			if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), `"submissionUnknown":true`) {
				t.Errorf("duplicate in flight: %d %s", response.Code, response.Body.String())
			}
		}()
	}
	wg.Wait()
	conflict := videoSubmissionTestPost(handler, server.URL, "concurrent", "different", "local")
	close(release)
	created := <-first
	if conflict.Code != http.StatusConflict || created.Code != http.StatusOK || calls.Load() != 1 {
		t.Fatalf("conflict=%d created=%d calls=%d; %s", conflict.Code, created.Code, calls.Load(), created.Body.String())
	}
	repeated := videoSubmissionTestPost(Video(cfg), server.URL, "concurrent", "海边", "local")
	if repeated.Code != http.StatusOK || !strings.Contains(repeated.Body.String(), `"taskId":"video-original"`) || calls.Load() != 1 {
		t.Fatalf("accepted duplicate: %d %s calls=%d", repeated.Code, repeated.Body.String(), calls.Load())
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	_ = db.QueryRow(`SELECT count(*) FROM "ImageTask"`).Scan(&count)
	if count != 1 {
		t.Fatalf("receipt count=%d", count)
	}
	// Finishing the task must not destroy the immutable request fingerprint.
	updateTaskTerminal(context.Background(), db, "video-original", "SUCCESS", "https://cdn.example/video.mp4", "", "")
	conflict = videoSubmissionTestPost(handler, server.URL, "concurrent", "changed after success", "local")
	if conflict.Code != http.StatusConflict || calls.Load() != 1 {
		t.Fatalf("terminal conflict: %d %s", conflict.Code, conflict.Body.String())
	}
}

func TestVideoSubmissionReceiptRecoversLostResponseAndIsolatesWorkspace(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprintf(w, `{"task_id":"video-%d"}`, calls.Add(1))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	// Treat the first HTTP response as lost. A fresh handler has no in-memory claim.
	_ = videoSubmissionTestPost(Video(cfg), server.URL, "same-key", "海边", "workspace-a")
	recovered := videoSubmissionTestGet(Video(cfg), "same-key", "workspace-a")
	if recovered.Code != http.StatusOK || !strings.Contains(recovered.Body.String(), `"taskId":"video-1"`) || !strings.Contains(recovered.Body.String(), `"submissionOutcome":"accepted"`) {
		t.Fatalf("recovered receipt: %d %s", recovered.Code, recovered.Body.String())
	}
	hidden := videoSubmissionTestGet(Video(cfg), "same-key", "workspace-b")
	if strings.Contains(hidden.Body.String(), "video-1") || !strings.Contains(hidden.Body.String(), "QUERY_FAILED") {
		t.Fatalf("cross-workspace leak: %s", hidden.Body.String())
	}
	created := videoSubmissionTestPost(Video(cfg), server.URL, "same-key", "different parameters", "workspace-b")
	if created.Code != http.StatusOK || !strings.Contains(created.Body.String(), `"taskId":"video-2"`) || calls.Load() != 2 {
		t.Fatalf("independent workspace: %d %s", created.Code, created.Body.String())
	}
}
