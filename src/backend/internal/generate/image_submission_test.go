package generate

import (
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func imageSubmissionPost(handler http.Handler, base, key, prompt, workspace string) *httptest.ResponseRecorder {
	payload, _ := json.Marshal(map[string]any{"model": "gpt-image-2", "prompt": prompt, "customBaseUrl": base, "customApiKey": "test-only"})
	r := httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(string(payload)))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	r.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestImageSubmissionConcurrentClaimAndConflict(t *testing.T) {
	var calls atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	defer unblock.Do(func() { close(release) })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		_, _ = w.Write([]byte(`{"task_id":"original-image"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	handler := Image(cfg)
	first := make(chan *httptest.ResponseRecorder, 1)
	go func() { first <- imageSubmissionPost(handler, server.URL, "same-key", "海边", "owner") }()
	<-started
	var group sync.WaitGroup
	for i := 0; i < 12; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			w := imageSubmissionPost(handler, server.URL, "same-key", "海边", "owner")
			if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
				t.Errorf("pending: %d %s", w.Code, w.Body.String())
			}
		}()
	}
	group.Wait()
	conflict := imageSubmissionPost(handler, server.URL, "same-key", "changed prompt", "owner")
	unblock.Do(func() { close(release) })
	created := <-first
	if created.Code != http.StatusOK || conflict.Code != http.StatusConflict || calls.Load() != 1 {
		t.Fatalf("created=%d conflict=%d calls=%d", created.Code, conflict.Code, calls.Load())
	}
	reused := imageSubmissionPost(Image(cfg), server.URL, "same-key", "海边", "owner")
	if reused.Code != http.StatusOK || !strings.Contains(reused.Body.String(), `"taskId":"original-image"`) || calls.Load() != 1 {
		t.Fatalf("reuse: %d %s calls=%d", reused.Code, reused.Body.String(), calls.Load())
	}
	other := imageSubmissionPost(handler, server.URL, "same-key", "different", "other")
	if other.Code != http.StatusOK || calls.Load() != 2 {
		t.Fatalf("workspace: %d %s calls=%d", other.Code, other.Body.String(), calls.Load())
	}
}

func TestImageUnknownReceiptIsNotResubmitted(t *testing.T) {
	for _, upstream := range []struct {
		name   string
		status int
		body   string
	}{
		{"server-error", 500, `{"message":"uncertain"}`},
		{"missing-receipt", 200, `{}`},
		{"timeout-response", 408, `{"message":"uncertain"}`},
	} {
		t.Run(upstream.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.WriteHeader(upstream.status)
				_, _ = w.Write([]byte(upstream.body))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			first := imageSubmissionPost(Image(cfg), server.URL, "unknown", "海边", "local")
			if first.Code < 500 || !strings.Contains(first.Body.String(), `"submissionUnknown":true`) {
				t.Fatalf("first: %d %s", first.Code, first.Body.String())
			}
			repeat := imageSubmissionPost(Image(cfg), server.URL, "unknown", "海边", "local")
			if repeat.Code != http.StatusServiceUnavailable || calls.Load() != 1 {
				t.Fatalf("repeat: %d %s calls=%d", repeat.Code, repeat.Body.String(), calls.Load())
			}
			w := httptest.NewRecorder()
			Image(cfg).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/generate/image?taskKey=unknown", nil))
			if !strings.Contains(w.Body.String(), `"status":"QUERY_FAILED"`) || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
				t.Fatalf("recovery: %s", w.Body.String())
			}
		})
	}
}

func TestImageReceiptPersistsAfterCallerCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	r := httptest.NewRequest(http.MethodPost, "/api/generate/image", nil)
	claim, status, message := claimImageSubmission(cfg, r, map[string]json.RawMessage{}, "gpt-image-2", "海边", "high", "3:4", "cancelled")
	if status != 0 {
		t.Fatalf("claim: %d %s", status, message)
	}
	ctx, cancel := context.WithCancel(r.Context())
	cancel()
	r = r.WithContext(ctx)
	if err := finishImageSubmission(cfg, r, claim.recordID, imageAdapted{modelID: "gpt-image-2", prompt: "海边"}, "accepted-task", "", "3:4"); err != nil {
		t.Fatal(err)
	}
	fresh := httptest.NewRequest(http.MethodGet, "/api/generate/image", nil)
	row, err := lookupImageTaskByKey(cfg, fresh, "cancelled")
	if err != nil || row.taskID != "accepted-task" || row.status != "IN_PROGRESS" {
		t.Fatalf("receipt: %+v %v", row, err)
	}
}

func TestImageSubmissionReusesRejectedAndLegacyReceipts(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"invalid image size"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	for i := 0; i < 2; i++ {
		w := imageSubmissionPost(Image(cfg), server.URL, "rejected", "海边", "local")
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "invalid image size") {
			t.Fatalf("rejection: %d %s", w.Code, w.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("rejected request resubmitted %d times", calls.Load())
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","resultUrl","idempotencyKey","mediaType")
		VALUES ('old-record','local','direct_old','SUCCESS','/storage/old.png','legacy',NULL)`)
	if err != nil {
		t.Fatal(err)
	}
	w := imageSubmissionPost(Image(cfg), server.URL, "legacy", "海边", "local")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "/storage/old.png") || calls.Load() != 1 {
		t.Fatalf("legacy receipt: %d %s", w.Code, w.Body.String())
	}
}

func TestImageTransportFailureKeepsUnknownReceipt(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		conn, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		_ = conn.Close()
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	for i := 0; i < 2; i++ {
		w := imageSubmissionPost(Image(cfg), server.URL, "connection-lost", "海边", "local")
		if w.Code < 500 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
			t.Fatalf("transport receipt: %d %s", w.Code, w.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("uncertain request resubmitted %d times", calls.Load())
	}
}

func TestImageReceiptLookupAndReuseFilterMedia(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("receipt lookup must not call upstream: %s %s", r.Method, r.URL)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cases := []struct {
		name  string
		media any
	}{
		{"image", "image"},
		{"legacy null", nil},
		{"legacy empty", ""},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := db.Exec(`DELETE FROM "ImageTask"`)
			if err != nil {
				t.Fatal(err)
			}
			_, err = db.Exec(`INSERT INTO "ImageTask" ("id", "workspaceId", "idempotencyKey", "taskId", "status", "resultUrl", "mediaType", "createdAt") VALUES
				('image-row','local','shared','direct_image','SUCCESS','https://cdn.example/image.png',?,'2026-01-01'),
				('video-row','local','shared','video-task','SUCCESS','https://cdn.example/video.mp4','video','2026-02-01'),
				('other-workspace','elsewhere','shared','direct_other','SUCCESS','https://cdn.example/other.png','image','2026-03-01')`, item.media)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskKey=shared", nil)
			row, err := lookupImageTaskByKey(cfg, request, "shared")
			if err != nil || !row.found || row.taskID != "direct_image" {
				t.Fatalf("lookup: %+v %v", row, err)
			}
			response := httptest.NewRecorder()
			Image(cfg).ServeHTTP(response, request)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "https://cdn.example/image.png") || strings.Contains(response.Body.String(), "video.mp4") {
				t.Fatalf("image taskKey: %d %s", response.Code, response.Body.String())
			}
			_, err = db.Exec(`DELETE FROM "ImageTask" WHERE "id" = 'image-row'`)
			if err != nil {
				t.Fatal(err)
			}
			row, err = lookupImageTaskByKey(cfg, request, "shared")
			if err != nil || row.found {
				t.Fatalf("video-only key must not resolve as image: %+v %v", row, err)
			}

		})
	}
}

func TestImageRecheckKeepsSavedSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("saved image recovery must not query upstream: %s", r.URL)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
		INSERT INTO "ImageTask" ("id", "workspaceId", "taskId", "status", "resultUrl")
		VALUES ('saved', 'local', 'original-image', 'SUCCESS', '/storage/generated/original.png')`)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=original-image&recheck_failed=1", nil)
	body, status, ok := savedTerminal(cfg, request, "image", "original-image", "failed")
	if !ok || status != http.StatusOK || body["status"] != "SUCCESS" || body["resultUrl"] != "/storage/generated/original.png" {
		t.Fatalf("saved image not recovered: %v %d %v", body, status, ok)
	}
	_, err = db.Exec(`UPDATE "ImageTask" SET "status" = 'FAILURE', "resultUrl" = NULL, "failReason" = 'old failure'`)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, ok := savedTerminal(cfg, request, "image", "original-image", "failed"); ok {
		t.Fatal("explicit failed-task recheck must reach upstream")
	}
}

func TestCanvasImagePollDoesNotGuessLegacyRouteOrTreatQueryFailureAsTerminal(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
		INSERT INTO "ImageTask" ("id", "workspaceId", "taskId", "status", "failReason")
		VALUES ('legacy-row', 'local', 'legacy-image', 'FAILURE', 'old failure')`)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=legacy-image&requireRoute=true&recheck_failed=1", nil)
	r.Header.Set("x-custom-base-url", server.URL)
	r.Header.Set("x-custom-api-key", "fixture-key")
	r.Header.Set("x-task-record-id", "legacy-row")
	w := httptest.NewRecorder()
	Image(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusConflict || calls != 0 {
		t.Fatalf("missing route used upstream: %d calls=%d", w.Code, calls)
	}
	w = httptest.NewRecorder()
	writeProbeMiss(cfg, w, r, "image", "legacy-image", "failed", "query unavailable")
	if !strings.Contains(w.Body.String(), `"status":"QUERY_FAILED"`) {
		t.Fatalf("a failed query echoed a stale terminal failure: %s", w.Body.String())
	}
}

func TestImageBrowserDisconnectKeepsSubmissionRecoverable(t *testing.T) {
	var calls atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		select {
		case <-release:
			_, _ = w.Write([]byte(`{"task_id":"image-after-refresh"}`))
		case <-r.Context().Done():
		}
	}))
	defer func() {
		unblock.Do(func() { close(release) })
		server.Close()
	}()
	cfg := videoSubmissionTestConfig(t, server)
	handler := Image(cfg)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"model":"gpt-image-2","prompt":"海边","customBaseUrl":"`+server.URL+`","customApiKey":"test-only"}`)).WithContext(ctx)
	r.Header.Set("x-idempotency-key", "browser-refresh")
	response := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { defer close(done); handler.ServeHTTP(response, r) }()
	select {
	case <-started:
	case <-done:
		t.Fatalf("submission ended before reaching provider: %d %s", response.Code, response.Body.String())
	case <-time.After(3 * time.Second):
		t.Fatal("submission did not reach provider")
	}
	cancel() // Reload closes the browser request after the provider accepted it.
	unblock.Do(func() { close(release) })
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("submission did not finish after browser disconnected")
	}
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"taskId":"image-after-refresh"`) {
		t.Fatalf("lost receipt after refresh: %d %s", response.Code, response.Body.String())
	}
	row, err := lookupImageTaskByKey(cfg, httptest.NewRequest(http.MethodGet, "/api/generate/image", nil), "browser-refresh")
	if err != nil || row.taskID != "image-after-refresh" || row.status != "IN_PROGRESS" {
		t.Fatalf("unrecoverable receipt: %+v %v", row, err)
	}
	reused := imageSubmissionPost(handler, server.URL, "browser-refresh", "海边", "local")
	if reused.Code != http.StatusOK || calls.Load() != 1 {
		t.Fatalf("refresh resubmitted: %d %s calls=%d", reused.Code, reused.Body.String(), calls.Load())
	}
}

func TestImageDisconnectedBeforeSubmissionDoesNotCallProvider(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"海边","customBaseUrl":"`+server.URL+`","customApiKey":"test-only"}`)).WithContext(ctx)
	r.Header.Set("x-idempotency-key", "already-disconnected")
	w := httptest.NewRecorder()
	Image(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusRequestTimeout || calls.Load() != 0 || !strings.Contains(w.Body.String(), `"submitted":false`) {
		t.Fatalf("submitted after disconnect: %d %s calls=%d", w.Code, w.Body.String(), calls.Load())
	}
}
