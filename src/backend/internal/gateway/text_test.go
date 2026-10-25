package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func textTestPayload(model string) map[string]any {
	return map[string]any{"model": model, "messages": []any{map[string]any{"role": "system", "content": "Be precise"}, map[string]any{"role": "user", "content": "hello"}}, "max_tokens": 4096}
}

func textTestMessage(data map[string]any) map[string]any {
	return textMap(textMap(textArray(data["choices"])[0])["message"])
}

func TestTextProtocolResolution(t *testing.T) {
	for _, tc := range []struct{ model, explicit, want string }{
		{"gemini-4-argon", "", "gemini"}, {"claude-5.5-haiku", "auto", "anthropic"}, {"gpt-5", "", "openai"},
		{"my-gemini-alias", "", "openai"}, {"gemini-4-argon", "OPENAI", "openai"}, {"x", "unsupported", "unsupported"},
	} {
		if got := ResolveTextProtocol(tc.model, tc.explicit); got != tc.want {
			t.Fatalf("%+v: %s", tc, got)
		}
	}
	ctx := WithTextProtocol(context.Background(), "openai")
	if got := TextProtocol(ctx, "claude-5.5-haiku"); got != "openai" {
		t.Fatal(got)
	}
	if got := TextProtocol(WithTextProtocol(ctx, "auto"), "claude-5.5-haiku"); got != "anthropic" {
		t.Fatal(got)
	}
	if got := TextProtocolForBase(WithTextProtocol(ctx, "auto"), "gemini-2.5-flash", "https://api.openai.com"); got != "openai" {
		t.Fatal(got)
	}
}

func TestTextProtocolResolutionPrefersKnownBaseEndpoints(t *testing.T) {
	for _, tc := range []struct {
		model, explicit, base, want string
	}{
		{"gemini-2.5-flash", "auto", "https://api.openai.com", "openai"},
		{"claude-3-7-sonnet", "auto", "https://api.anthropic.com", "anthropic"},
		{"gemini-2.5-flash", "auto", "https://generativelanguage.googleapis.com", "gemini"},
		{"gemini-2.5-flash", "openai", "https://api.anthropic.com", "openai"},
		{"gemini-2.5-flash", "auto", "https://relay.example", "gemini"},
	} {
		if got := ResolveTextProtocolForBase(tc.model, tc.explicit, tc.base); got != tc.want {
			t.Fatalf("%+v: %s", tc, got)
		}
	}
}

func TestTextNativeAuthenticationAndPaths(t *testing.T) {
	for _, tc := range []struct{ model, protocol, base, path, header, body string }{
		{"gemini-4-argon", "", "/gateway/v1beta", "/gateway/v1beta/models/gemini-4-argon:generateContent", "x-goog-api-key", `{"candidates":[{"content":{"parts":[{"text":"hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2,"thoughtsTokenCount":3,"totalTokenCount":15}}`},
		{"claude-5.5-haiku", "", "/proxy/v1", "/proxy/v1/messages", "x-api-key", `{"id":"m1","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":2}}`},
		{"gemini-alias", "openai", "/custom/v1/chat/completions", "/custom/v1/chat/completions", "Authorization", `{"choices":[{"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}]}`},
	} {
		t.Run(tc.model, func(t *testing.T) {
			var got map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != tc.path || r.URL.RawQuery != "" {
					t.Errorf("path %s", r.URL.String())
				}
				want := "secret-test"
				if tc.header == "Authorization" {
					want = "Bearer " + want
				}
				if r.Header.Get(tc.header) != want {
					t.Errorf("missing authentication header %s", tc.header)
				}
				if tc.header != "Authorization" && r.Header.Get("Authorization") != "" {
					t.Error("Bearer leaked into native request")
				}
				if tc.header == "x-api-key" && r.Header.Get("anthropic-version") != "2023-06-01" {
					t.Error("missing Claude API version")
				}
				if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
					t.Error(err)
				}
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, tc.body)
			}))
			defer server.Close()
			payload := textTestPayload(tc.model)
			original, _ := json.Marshal(payload)
			status, result, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL + tc.base, APIKey: "secret-test", Protocol: tc.protocol, Payload: payload})
			if err != nil || status != 200 {
				t.Fatalf("status=%d err=%v", status, err)
			}
			if textTestMessage(result)["content"] != "hello" {
				t.Fatal(result)
			}
			after, _ := json.Marshal(payload)
			if string(after) != string(original) {
				t.Error("input payload mutated")
			}
			switch tc.header {
			case "x-goog-api-key":
				if got["systemInstruction"] == nil || got["messages"] != nil {
					t.Fatal(got)
				}
				if usage := textMap(result["usage"]); textNumber(usage["completion_tokens"]) != 5 || textNumber(textMap(usage["completion_tokens_details"])["reasoning_tokens"]) != 3 {
					t.Fatal(usage)
				}
			case "x-api-key":
				if got["system"] == nil || got["max_tokens"] != float64(4096) {
					t.Fatal(got)
				}
			default:
				if result["usage"] != nil {
					t.Fatal("fabricated usage", result)
				}
			}
		})
	}
}

func TestTextEndpointPreservesCustomPrefix(t *testing.T) {
	for _, tc := range []struct {
		base, protocol, want string
		stream               bool
	}{
		{"https://example.test/a", "gemini", "https://example.test/a/v1beta/models/gemini-test:generateContent", false},
		{"https://example.test/a/v1", "gemini", "https://example.test/a/v1/models/gemini-test:streamGenerateContent?alt=sse", true},
		{"https://example.test/a/v1beta/models/old:generateContent", "gemini", "https://example.test/a/v1beta/models/gemini-test:generateContent", false},
		{"https://example.test/a/v1/messages", "anthropic", "https://example.test/a/v1/messages", false},
		{"https://example.test/a", "anthropic", "https://example.test/a/v1/messages", false},
		{"https://example.test/a/v1beta", "anthropic", "https://example.test/a/v1/messages", false},
		{"https://example.test/proxy/v1/chat/completions", "anthropic", "https://example.test/proxy/v1/messages", false},
		{"https://example.test/proxy/v1beta/messages", "anthropic", "https://example.test/proxy/v1/messages", false},
		{"https://example.test/a", "openai", "https://example.test/a/v1/chat/completions", false},
		{"https://maas.qianwenaiapi.com", "openai", "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions", false},
		{"https://dashscope.aliyuncs.com/api/v1", "openai", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", false},
		{"https://maas.qianwenaiapi.com/compatible-mode/v1", "openai", "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions", false},
	} {
		got, err := textEndpoint(tc.base, "gemini-test", tc.protocol, tc.stream)
		if err != nil || got != tc.want {
			t.Fatalf("%+v => %s %v", tc, got, err)
		}
	}
	for _, base := range []string{"file:///a", "https://user:pass@example.test", "https://example.test?key=secret", "https://example.test#fragment"} {
		if _, err := textEndpoint(base, "m", "openai", false); err == nil {
			t.Fatal(base)
		}
	}
}

func TestAnthropicChatCompletionsBaseUsesMessages(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/proxy/v1/messages" || r.Header.Get("x-api-key") != "secret-test" || r.Header.Get("anthropic-version") != "2023-06-01" || r.Header.Get("Authorization") != "" {
			t.Errorf("request %s auth %q version %q", r.URL.Path, r.Header.Get("x-api-key"), r.Header.Get("anthropic-version"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Error(err)
		}
		io.WriteString(w, `{"content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn"}`)
	}))
	defer server.Close()
	status, result, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL + "/proxy/v1/chat/completions", APIKey: "secret-test", Protocol: "anthropic", Payload: textTestPayload("claude-5.5-haiku")})
	if err != nil || status != 200 || textTestMessage(result)["content"] != "hello" {
		t.Fatalf("status=%d err=%v result=%v", status, err, result)
	}
	if got["max_tokens"] != float64(4096) || got["system"] == nil || got["response_format"] != nil {
		t.Fatal(got)
	}
}

func TestTextErrorsNoFallbackAndRedirectAuthentication(t *testing.T) {
	visits := 0
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { visits++; t.Error("cross-origin redirect followed") }))
	defer destination.Close()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/redirect") {
			http.Redirect(w, r, destination.URL, http.StatusTemporaryRedirect)
			return
		}
		w.WriteHeader(429)
		io.WriteString(w, `{"error":{"message":"secret-test rate limited"}}`)
	}))
	defer upstream.Close()
	status, _, err := CompleteText(context.Background(), TextRequest{BaseURL: upstream.URL, APIKey: "secret-test", Payload: textTestPayload("gpt-test")})
	if status != 429 || err == nil || strings.Contains(err.Error(), "secret-test") {
		t.Fatalf("%d %v", status, err)
	}
	_, _, err = CompleteText(context.Background(), TextRequest{BaseURL: upstream.URL + "/redirect", APIKey: "secret-test", Payload: textTestPayload("claude-test")})
	if err == nil || visits != 0 {
		t.Fatalf("redirect visits %d err %v", visits, err)
	}
	_, _, err = CompleteText(context.Background(), TextRequest{BaseURL: upstream.URL, Protocol: "invalid", Payload: textTestPayload("gpt-test")})
	if err == nil {
		t.Fatal("unknown protocol accepted")
	}
}

func TestTextTimeoutAndInvalidResponses(t *testing.T) {
	for _, body := range []string{`not JSON`, `{"error":{"message":"bad"}}`, `{"choices":[]}`, `{"choices":[{"message":{"tool_calls":[{"id":"c","function":{"name":"f","arguments":"{"}}]},"finish_reason":"tool_calls"}]}`} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, body) }))
		_, result, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Payload: textTestPayload("gpt-test")})
		server.Close()
		if err == nil || result != nil {
			t.Fatalf("unsafe invalid result=%v error=%v", result, err)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.Copy(io.Discard, r.Body); <-r.Context().Done() }))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, _, err := CompleteText(ctx, TextRequest{BaseURL: server.URL, Payload: textTestPayload("gpt-test")})
	if err == nil {
		t.Fatal("missing timeout")
	}
}

func TestTextUsageOnlyUsesReportedValues(t *testing.T) {
	for _, usage := range []map[string]any{geminiUsage(nil), anthropicUsage(nil)} {
		if len(usage) != 0 {
			t.Fatal(usage)
		}
	}
	usage := anthropicUsage(map[string]any{"input_tokens": float64(10), "output_tokens": float64(5), "cache_read_input_tokens": float64(7), "cache_creation_input_tokens": float64(3)})
	if !reflect.DeepEqual(usage["prompt_tokens"], float64(20)) || usage["total_tokens"] != float64(25) {
		t.Fatal(usage)
	}
	if usage := geminiUsage(map[string]any{"promptTokenCount": float64(10)}); usage["completion_tokens"] != nil || usage["total_tokens"] != nil {
		t.Fatal(usage)
	}
}
