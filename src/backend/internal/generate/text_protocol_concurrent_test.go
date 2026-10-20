package generate

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestConcurrentTextRequestsKeepIndependentProtocols(t *testing.T) {
	var claudeCalls, geminiCalls atomic.Int32
	claudeStarted, geminiStarted := make(chan struct{}), make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var other <-chan struct{}
		var reply string
		switch r.URL.Path {
		case "/v1/messages":
			if claudeCalls.Add(1) == 1 {
				close(claudeStarted)
			}
			other = geminiStarted
			if r.Header.Get("x-api-key") != "claude-key" {
				t.Error("Claude credentials mixed")
			}
			reply = `{"content":[{"type":"text","text":"claude"}],"stop_reason":"end_turn"}`
		case "/v1beta/models/shared-alias:generateContent":
			if geminiCalls.Add(1) == 1 {
				close(geminiStarted)
			}
			other = claudeStarted
			if r.Header.Get("x-goog-api-key") != "gemini-key" {
				t.Error("Gemini credentials mixed")
			}
			reply = `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"gemini"}]}}]}`
		default:
			t.Errorf("unexpected protocol path %s", r.URL.Path)
			w.WriteHeader(500)
			return
		}
		select {
		case <-other:
			_, _ = w.Write([]byte(reply))
		case <-r.Context().Done():
		}
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { ModelHTTP = previous }()
	results := make(chan error, 2)
	for _, input := range []struct{ protocol, key, want string }{
		{"anthropic", "claude-key", "claude"}, {"gemini", "gemini-key", "gemini"},
	} {
		r := httptest.NewRequest(http.MethodPost, "/", nil)
		r.Header.Set("x-text-protocol", "openai")
		r, ok := BindTextProtocol(httptest.NewRecorder(), r, map[string]any{"textProtocol": input.protocol})
		if !ok {
			t.Fatal("valid protocol rejected")
		}
		go func() {
			// Match asynchronous consumers that outlive the incoming request.
			ctx := context.WithoutCancel(r.Context())
			text, _, status, err := ChatCompletion(ctx, server.URL, input.key, "shared-alias", []any{map[string]any{"role": "user", "content": "test"}}, .2, 3*time.Second)
			if err == nil && (status != 200 || text != input.want) {
				err = fmt.Errorf("%s got status %d text %q", input.protocol, status, text)
			}
			results <- err
		}()
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	if claudeCalls.Load() != 1 || geminiCalls.Load() != 1 {
		t.Fatalf("calls Claude=%d Gemini=%d", claudeCalls.Load(), geminiCalls.Load())
	}
}
