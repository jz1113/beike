package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
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
