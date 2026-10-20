package generate

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestVideoSubmissionReceiptWriteFailureNeverReplaysAcceptedRequest(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"task_id":"accepted-but-unsaved"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TRIGGER reject_receipt_update BEFORE UPDATE ON "ImageTask"
		BEGIN SELECT RAISE(ABORT, 'simulated receipt disk failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	first := videoSubmissionTestPost(Video(cfg), server.URL, "settle-failed", "海边", "local")
	second := videoSubmissionTestPost(Video(cfg), server.URL, "settle-failed", "海边", "local")
	polled := videoSubmissionTestGet(Video(cfg), "settle-failed", "local")
	if first.Code != http.StatusInternalServerError || !strings.Contains(first.Body.String(), `"taskId":"accepted-but-unsaved"`) || second.Code != http.StatusServiceUnavailable || calls.Load() != 1 {
		t.Fatalf("lost accepted receipt: first=%d %s second=%d %s calls=%d", first.Code, first.Body.String(), second.Code, second.Body.String(), calls.Load())
	}
	if !strings.Contains(polled.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("unsaved receipt must remain uncertain: %s", polled.Body.String())
	}
}

func TestVideoSubmissionIdentitySourcesAndImageIsolation(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"task_id":"identity-video"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = insertImageTask(context.Background(), db, "local", imageTaskDraft{
		Prompt: "image", TaskID: "image-original", Status: "SUCCESS", ResultURL: "https://cdn.example/image.png",
		MediaType: "image", IdempotencyKey: "identity",
	})
	if err != nil {
		t.Fatal(err)
	}
	requestBody := `{"prompt":"海边","model":"veo3.1","duration":8,"customApiKey":"secret","customBaseUrl":"` + server.URL + `"`
	handler := Video(cfg)
	// A body-only clientTaskId, body-only idempotencyKey and a header all identify
	// the same operation; credentials can be rotated without a new paid request.
	for _, identity := range []string{`,"clientTaskId":"identity"}`, `,"idempotencyKey":"identity"}`, `}`} {
		body := requestBody
		if identity == `}` {
			body = strings.ReplaceAll(body, `"customApiKey":"secret"`, `"customApiKey":"rotated"`)
		}
		r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(body+identity))
		if identity == `}` {
			r.Header.Set("x-idempotency-key", "identity")
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"taskId":"identity-video"`) {
			t.Fatalf("identity %s: %d %s", identity, w.Code, w.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("identity alias replayed: %d", calls.Load())
	}
	polled := videoSubmissionTestGet(handler, "identity", "local")
	if !strings.Contains(polled.Body.String(), `"taskId":"identity-video"`) || strings.Contains(polled.Body.String(), "image-original") {
		t.Fatalf("image/video receipts mixed: %s", polled.Body.String())
	}
}

func TestVideoSubmissionRejectsAmbiguousIdentityBeforeUpstream(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	for _, key := range []string{"different", strings.Repeat("a", 257)} {
		r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":8,"clientTaskId":"body","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`))
		r.Header.Set("x-idempotency-key", key)
		w := httptest.NewRecorder()
		Video(cfg).ServeHTTP(w, r)
		if w.Code != http.StatusBadRequest || calls.Load() != 0 {
			t.Fatalf("invalid identity: %d %s calls=%d", w.Code, w.Body.String(), calls.Load())
		}
	}
}
