package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestChatCompletionNativeProtocols(t *testing.T) {
	cases := []struct{ name, model, protocol, path, header, reply string }{
		{"gemini", "gemini-2.5-flash", "", "/v1beta/models/gemini-2.5-flash:generateContent", "x-goog-api-key", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"{\"ok\":true}"}]}}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":3,"totalTokenCount":5}}`},
		{"claude", "claude-sonnet-4-5", "", "/v1/messages", "x-api-key", `{"content":[{"type":"text","text":"{\"ok\":true}"}],"stop_reason":"end_turn","usage":{"input_tokens":2,"output_tokens":3}}`},
		{"deepseek official", "deepseek-official:deepseek-flash", "", "/v1/chat/completions", "Authorization", `{"choices":[{"finish_reason":"stop","message":{"content":"{\"ok\":true}"}}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}`},
		{"explicit compatible", "gemini-2.5-flash", "openai", "/v1/chat/completions", "Authorization", `{"choices":[{"finish_reason":"stop","message":{"content":"{\"ok\":true}"}}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.URL.Path != tc.path {
					t.Errorf("path %s", r.URL.Path)
				}
				expected := "secret"
				if tc.header == "Authorization" {
					expected = "Bearer secret"
				}
				if r.Header.Get(tc.header) != expected {
					t.Errorf("missing native credential")
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if tc.name == "deepseek official" {
					thinking, _ := body["thinking"].(map[string]any)
					if body["model"] != "deepseek-flash" || thinking["type"] != "disabled" {
						t.Errorf("DeepSeek payload %#v", body)
					}
				}
				encoded, _ := json.Marshal(body)
				if strings.Contains(string(encoded), "textProtocol") {
					t.Error("protocol leaked into upstream payload")
				}
				_, _ = w.Write([]byte(tc.reply))
			}))
			defer server.Close()
			previous := ModelHTTP
			ModelHTTP = func() *http.Client { return server.Client() }
			defer func() { ModelHTTP = previous }()
			ctx := gateway.WithTextProtocol(context.Background(), tc.protocol)
			text, raw, status, err := ChatCompletionJSON(ctx, server.URL, "secret", tc.model, []any{map[string]any{"role": "user", "content": "test"}}, .2, time.Second)
			if err != nil || status != 200 || text != `{"ok":true}` || calls != 1 {
				t.Fatalf("status %d text %s calls %d err %v", status, text, calls, err)
			}
			if usage := NormalizeUsage(raw); usage["totalTokens"] != float64(5) {
				t.Fatalf("usage %#v", usage)
			}
		})
	}
}

func TestChatCompletionJSONEffortLeavesDeepSeekDisabled(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		thinking, _ := body["thinking"].(map[string]any)
		if _, ok := body["reasoning_effort"]; ok || thinking["type"] != "disabled" || body["model"] != "deepseek-flash" {
			t.Errorf("DeepSeek effort payload %#v", body)
		}
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"{\"ok\":true}"}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { ModelHTTP = previous }()
	text, _, status, err := ChatCompletionJSONWithEffort(context.Background(), server.URL, "secret", "deepseek-official:deepseek-flash", []any{map[string]any{"role": "user", "content": "test"}}, .2, time.Second, "high")
	if err != nil || status != 200 || text != `{"ok":true}` {
		t.Fatalf("status %d text %s err %v", status, text, err)
	}
}

func TestTextProtocolBodyOverridesHeaderAndValidates(t *testing.T) {
	cases := []struct {
		body         map[string]any
		header, want string
		invalid      bool
	}{
		{map[string]any{}, "anthropic", "anthropic", false},
		{map[string]any{"overrides": map[string]any{"textProtocol": "anthropic"}}, "openai", "anthropic", false},
		{map[string]any{"textProtocol": "gemini", "overrides": map[string]any{"textProtocol": 42}}, "openai", "gemini", false},
		{map[string]any{"textProtocol": "openai"}, "invalid", "openai", false},
		{map[string]any{"textProtocol": "auto"}, "openai", "gemini", false},
		{map[string]any{"textProtocol": ""}, "openai", "gemini", false},
		{map[string]any{"textProtocol": nil}, "openai", "", true},
		{map[string]any{"textProtocol": "bad"}, "openai", "", true},
		{map[string]any{}, "bad", "", true},
	}
	for _, tc := range cases {
		r := httptest.NewRequest(http.MethodPost, "/", nil)
		r.Header.Set("x-text-protocol", tc.header)
		rec := httptest.NewRecorder()
		bound, ok := BindTextProtocol(rec, r, tc.body)
		if tc.invalid {
			if ok || rec.Code != 400 {
				t.Fatalf("invalid protocol accepted: %#v", tc)
			}
			continue
		}
		if !ok || gateway.TextProtocol(bound.Context(), "gemini-2.5-flash") != tc.want {
			t.Fatalf("protocol %#v", tc)
		}
		if gateway.TextProtocol(r.Context(), "gemini-2.5-flash") != "gemini" {
			t.Fatal("request context mutated")
		}
	}
}

func TestNativeCopyFailureDoesNotFallbackOrReplay(t *testing.T) {
	for _, reply := range []string{`{"error":{"message":"rejected"}}`, `{"candidates":[]}`} {
		calls := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			calls++
			if strings.Contains(reply, "rejected") {
				w.WriteHeader(429)
			}
			_, _ = w.Write([]byte(reply))
		}))
		previous := ModelHTTP
		ModelHTTP = func() *http.Client { return server.Client() }
		body := `{"model":"gemini-2.5-flash","productTitle":"台灯","customApiKey":"secret","customBaseUrl":"` + server.URL + `"}`
		rec := httptest.NewRecorder()
		Copywriting(config.Config{}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
		ModelHTTP = previous
		server.Close()
		if rec.Code != 502 || calls != 1 || strings.Contains(rec.Body.String(), `"fromFallback":true`) {
			t.Fatalf("status %d calls %d body %s", rec.Code, calls, rec.Body.String())
		}
	}
}

func TestCanvasNativeTruncationRemainsRejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"部分正文"}]}}]}`))
	}))
	defer server.Close()
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	defer func() { canvasHTTP = previous }()
	_, status, message, _ := completeCanvasText(context.Background(), server.URL, "secret", "gemini-2.5-flash", false, "写一句")
	if status != 502 || !strings.Contains(message, "未完整") {
		t.Fatalf("status %d message %s", status, message)
	}
}
