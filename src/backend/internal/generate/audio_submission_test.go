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
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

func audioSubmissionRequest(handler http.Handler, base, key, prompt, workspace string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]any{"model": "speech-2.8-hd", "prompt": prompt, "clientTaskId": key, "customBaseUrl": base, "customApiKey": "test-only"})
	r := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(string(body)))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	r.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestS09AudioConcurrentSerialAndConflictingSubmissions(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		_, _ = w.Write([]byte(`{"audio_url":"https://media.example/audio.mp3","usage":{"total_tokens":7}}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	handler := Audio(cfg)
	first := make(chan *httptest.ResponseRecorder, 1)
	go func() { first <- audioSubmissionRequest(handler, server.URL, "same-audio", "hello", "owner") }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("audio did not start")
	}
	var group sync.WaitGroup
	for i := 0; i < 8; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			w := audioSubmissionRequest(handler, server.URL, "same-audio", "hello", "owner")
			if w.Code != 409 {
				t.Errorf("pending %d %s", w.Code, w.Body.String())
			}
		}()
	}
	group.Wait()
	close(release)
	initial := <-first
	if initial.Code != 200 {
		t.Fatalf("first %d %s", initial.Code, initial.Body.String())
	}
	repeated := audioSubmissionRequest(Audio(cfg), server.URL, "same-audio", "hello", "owner")
	if repeated.Code != 200 || calls.Load() != 1 || !strings.Contains(repeated.Body.String(), `"replayed":true`) {
		t.Fatalf("duplicate %d calls=%d %s", repeated.Code, calls.Load(), repeated.Body.String())
	}
	changed := audioSubmissionRequest(handler, server.URL, "same-audio", "changed", "owner")
	if changed.Code != 409 || calls.Load() != 1 {
		t.Fatalf("changed %d calls=%d", changed.Code, calls.Load())
	}
	if other := audioSubmissionRequest(handler, server.URL, "same-audio", "hello", "other"); other.Code != 200 || calls.Load() != 2 {
		t.Fatalf("workspace collision %d calls=%d", other.Code, calls.Load())
	}
}

func TestS09AudioDisconnectRetainsFinishedReceiptAndUsage(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		<-release
		_, _ = w.Write([]byte(`{"audio_url":"https://media.example/recovered.mp3","usage":{"total_tokens":9}}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	body, _ := json.Marshal(map[string]any{"model": "speech-2.8-hd", "prompt": "hello", "clientTaskId": "disconnect", "customBaseUrl": server.URL, "customApiKey": "test-only"})
	r := httptest.NewRequest("POST", "/api/generate/audio", strings.NewReader(string(body)))
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	r = r.WithContext(ctx)
	r.Header.Set("x-idempotency-key", "disconnect")
	done := make(chan struct{})
	go func() { defer close(done); Audio(cfg).ServeHTTP(httptest.NewRecorder(), r) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("not dispatched")
	}
	cancel()
	close(release)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("did not settle")
	}
	w := httptest.NewRecorder()
	Audio(cfg).ServeHTTP(w, httptest.NewRequest("GET", "/api/generate/audio?taskKey=disconnect", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "recovered.mp3") || !strings.Contains(w.Body.String(), `"totalTokens":9`) || calls.Load() != 1 {
		t.Fatalf("recovery %d %s calls=%d", w.Code, w.Body.String(), calls.Load())
	}
}

func TestS09AudioUnknownTransportNeverFallsBackOrResubmits(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		connection, _, err := w.(http.Hijacker).Hijack()
		if err == nil {
			_ = connection.Close()
		}
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	for i := 0; i < 2; i++ {
		result := audioSubmissionRequest(Audio(cfg), server.URL, "unknown", "hello", "local")
		if result.Code != 502 || !strings.Contains(result.Body.String(), `"submissionUnknown":true`) || strings.Contains(result.Body.String(), `"status":"FAILED"`) {
			t.Fatalf("unknown %d %s", result.Code, result.Body.String())
		}
	}
	w := httptest.NewRecorder()
	Audio(cfg).ServeHTTP(w, httptest.NewRequest("GET", "/api/generate/audio?taskKey=unknown", nil))
	if !strings.Contains(w.Body.String(), `"submissionUnknown":true`) || calls.Load() != 1 {
		t.Fatalf("unknown recovery %d %s calls=%d", w.Code, w.Body.String(), calls.Load())
	}
}
