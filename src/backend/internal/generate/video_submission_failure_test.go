package generate

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
)

func TestVideoSubmissionUnknownIsNeverReplayed(t *testing.T) {
	cases := []struct {
		name, body string
		status     int
		disconnect bool
	}{
		{name: "response lost", disconnect: true},
		{name: "server error", status: http.StatusServiceUnavailable, body: `{"error":"unavailable"}`},
		{name: "missing task id", status: http.StatusOK, body: `{}`},
		{name: "uncertain known task", status: http.StatusInternalServerError, body: `{"task_id":"uncertain-id"}`},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if item.disconnect {
					conn, _, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					_ = conn.Close()
					return
				}
				w.WriteHeader(item.status)
				_, _ = w.Write([]byte(item.body))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			first := videoSubmissionTestPost(Video(cfg), server.URL, "unknown", "海边", "local")
			second := videoSubmissionTestPost(Video(cfg), server.URL, "unknown", "海边", "local")
			polled := videoSubmissionTestGet(Video(cfg), "unknown", "local")
			for _, response := range []*httptest.ResponseRecorder{first, second, polled} {
				if !strings.Contains(response.Body.String(), `"submissionUnknown":true`) || !strings.Contains(response.Body.String(), `"retryable":false`) {
					t.Errorf("unknown receipt: %d %s", response.Code, response.Body.String())
				}
			}
			if calls.Load() != 1 {
				t.Fatalf("unknown submit replayed %d times", calls.Load())
			}
			if item.name == "uncertain known task" && !strings.Contains(polled.Body.String(), `"taskId":"uncertain-id"`) {
				t.Fatalf("unknown task ID lost: %s", polled.Body.String())
			}
		})
	}
}

func TestVideoSubmissionRejectionIsDurable(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"明确拒绝"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	first := videoSubmissionTestPost(Video(cfg), server.URL, "rejected", "海边", "local")
	second := videoSubmissionTestPost(Video(cfg), server.URL, "rejected", "海边", "local")
	polled := videoSubmissionTestGet(Video(cfg), "rejected", "local")
	if first.Code != http.StatusBadRequest || second.Code != http.StatusBadRequest || polled.Code != http.StatusOK || calls.Load() != 1 {
		t.Fatalf("codes=%d/%d/%d calls=%d", first.Code, second.Code, polled.Code, calls.Load())
	}
	if !strings.Contains(polled.Body.String(), `"submissionRejected":true`) || !strings.Contains(polled.Body.String(), "明确拒绝") || !strings.Contains(polled.Body.String(), `"status":"FAILURE"`) {
		t.Fatalf("rejected receipt: %s", polled.Body.String())
	}
}

func TestVideoSubmissionPersistenceFailurePreventsUpstream(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`DROP TABLE "ImageTask"`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	response := videoSubmissionTestPost(Video(cfg), server.URL, "no-receipt", "海边", "local")
	if response.Code != http.StatusBadRequest || calls.Load() != 0 || !strings.Contains(response.Body.String(), `"submitted":false`) || !strings.Contains(response.Body.String(), `"retryable":true`) || strings.Contains(response.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("submit without receipt: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
	}
}

func TestVideoSubmissionAcceptedReceiptSurvivesCallerCancellation(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"task_id":"accepted-before-disconnect"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	transport := server.Client().Transport
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: videoReceiptRoundTripper(func(r *http.Request) (*http.Response, error) {
			response, err := transport.RoundTrip(r)
			if err == nil {
				body, readErr := io.ReadAll(response.Body)
				_ = response.Body.Close()
				if readErr != nil {
					return nil, readErr
				}
				response.Body = io.NopCloser(strings.NewReader(string(body)))
				cancel()
			}
			return response, err
		})}
	}
	r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":8,"clientTaskId":"cancelled","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	Video(cfg).ServeHTTP(w, r)
	polled := videoSubmissionTestGet(Video(cfg), "cancelled", "local")
	if calls.Load() != 1 || !strings.Contains(polled.Body.String(), `"taskId":"accepted-before-disconnect"`) || !strings.Contains(polled.Body.String(), `"submissionOutcome":"accepted"`) {
		t.Fatalf("cancelled accepted receipt: submit=%d %s poll=%s", w.Code, w.Body.String(), polled.Body.String())
	}
}

func TestVideoSubmissionCancelledBeforeDispatchDoesNotCallProvider(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":8,"clientTaskId":"cancelled-before-dispatch","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	Video(cfg).ServeHTTP(w, r)
	if calls.Load() != 0 || !strings.Contains(w.Body.String(), `"submissionRejected":true`) {
		t.Fatalf("cancelled request dispatched: calls=%d response=%s", calls.Load(), w.Body.String())
	}
}

func TestVideoSubmissionCancelledClaimSettlesAndCannotReplay(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest(http.MethodPost, "/api/generate/video", nil).WithContext(ctx)
	payload := map[string]json.RawMessage{"prompt": json.RawMessage(`"海边"`), "model": json.RawMessage(`"veo3.1"`), "duration": json.RawMessage(`8`)}
	claim, err := claimVideoSubmission(cfg, r, payload, buildVideoPayload("veo3.1", "海边", payload), server.URL, "cancelled-claim")
	if err != nil || !claim.claimed {
		t.Fatalf("claim before cancellation: %+v %v", claim, err)
	}
	cancel()
	if err := settleVideoSubmission(cfg, r, claim.recordID, imageTaskDraft{Status: "FAILURE", FailReason: "视频提交已取消，尚未向上游提交"}); err != nil {
		t.Fatalf("cancelled claim did not settle: %v", err)
	}
	polled := videoSubmissionTestGet(Video(cfg), "cancelled-claim", "local")
	replay := videoSubmissionTestPost(Video(cfg), server.URL, "cancelled-claim", "海边", "local")
	for _, response := range []*httptest.ResponseRecorder{polled, replay} {
		if !strings.Contains(response.Body.String(), `"submissionRejected":true`) || !strings.Contains(response.Body.String(), `"status":"FAILURE"`) {
			t.Fatalf("cancelled claim stayed pending: %s", response.Body.String())
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("cancelled claim resubmitted %d times", calls.Load())
	}
}

func TestVideoSubmissionReceivesTaskIDAfterCallerDisconnect(t *testing.T) {
	accepted, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(accepted)
		<-release
		_, _ = w.Write([]byte(`{"task_id":"accepted-after-disconnect"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	upstreamCancelled := make(chan struct{})
	transport := server.Client().Transport
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: videoReceiptRoundTripper(func(r *http.Request) (*http.Response, error) {
			response, err := transport.RoundTrip(r)
			if r.Context().Err() != nil {
				close(upstreamCancelled)
			}
			return response, err
		})}
	}
	r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":8,"clientTaskId":"disconnect-before-receipt","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { defer close(done); Video(cfg).ServeHTTP(w, r) }()
	select {
	case <-accepted:
	case <-time.After(5 * time.Second):
		close(release)
		t.Fatal("upstream submission never started")
	}
	cancel()
	// The provider has accepted the task but has not sent its ID yet. A browser
	// disconnect must leave the bounded provider request alive during this gap.
	select {
	case <-upstreamCancelled:
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("submission did not settle")
	}
	polled := videoSubmissionTestGet(Video(cfg), "disconnect-before-receipt", "local")
	if calls.Load() != 1 || !strings.Contains(polled.Body.String(), `"taskId":"accepted-after-disconnect"`) || !strings.Contains(polled.Body.String(), `"submissionOutcome":"accepted"`) {
		t.Fatalf("receipt lost: submit=%d %s recovery=%s calls=%d", w.Code, w.Body.String(), polled.Body.String(), calls.Load())
	}
}

func TestVideoSubmissionFailureRetainsUsageInRecovery(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusBadRequest, http.StatusInternalServerError} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"message":"generation unavailable","usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT`)
			db.Close()
			if err != nil {
				t.Fatal(err)
			}
			first := videoSubmissionTestPost(Video(cfg), server.URL, "reported-usage", "海边", "local")
			replay := videoSubmissionTestPost(Video(cfg), server.URL, "reported-usage", "海边", "local")
			polled := videoSubmissionTestGet(Video(cfg), "reported-usage", "local")
			for _, response := range []*httptest.ResponseRecorder{first, replay, polled} {
				if !strings.Contains(response.Body.String(), `"totalTokens":12`) {
					t.Fatalf("reported usage missing: %d %s", response.Code, response.Body.String())
				}
			}
		})
	}
}

type videoReceiptRoundTripper func(*http.Request) (*http.Response, error)

func (f videoReceiptRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
