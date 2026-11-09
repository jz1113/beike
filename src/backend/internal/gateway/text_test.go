package gateway

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
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

func TestTextInvalidOutputPreservesOnlyBillingReceipt(t *testing.T) {
	for _, tc := range []struct {
		name, protocol, body string
		responses            bool
	}{
		{"openai", "openai", `{"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7},"unsafe":"must not leak"}`, false},
		{"gemini", "gemini", `{"candidates":[],"usageMetadata":{"promptTokenCount":11,"candidatesTokenCount":7,"totalTokenCount":18},"unsafe":"must not leak"}`, false},
		{"anthropic", "anthropic", `{"content":[{"type":"tool_use","input":{}}],"stop_reason":"tool_use","usage":{"input_tokens":11,"output_tokens":7},"unsafe":"must not leak"}`, false},
		{"responses", "openai", `{"status":"incomplete","usage":{"input_tokens":11,"output_tokens":7},"output_text":"must not use"}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); _, _ = io.WriteString(w, tc.body) }))
			defer server.Close()
			req := TextRequest{BaseURL: server.URL, Protocol: tc.protocol, Payload: textTestPayload("test-model")}
			var body map[string]any
			var err error
			if tc.responses {
				_, body, err = CompleteResponses(context.Background(), req)
			} else {
				_, body, err = CompleteText(context.Background(), req)
			}
			if err == nil || body["submissionUnknown"] != true || calls.Load() != 1 {
				t.Fatal("invalid output accepted/repeated", err, body, calls.Load())
			}
			if usage := NormalizeUsage(body); usage == nil || usage["totalTokens"] != float64(18) {
				t.Fatal("reported usage lost", body)
			}
			if body["choices"] != nil || body["unsafe"] != nil || body["output_text"] != nil {
				t.Fatal("invalid content leaked", body)
			}
		})
	}
}

func TestTextClaudeJSONObjectCompatibility(t *testing.T) {
	for _, tc := range []struct {
		name, answer, content string
		valid                 bool
	}{
		{"raw", `{"ok":true}`, `{"ok":true}`, true},
		{"fence", "```json\n{\"ok\":true}\n```", `{"ok":true}`, true},
		{"prose", "说明 {\"ok\":true} 结束", `{"ok":true}`, true},
		{"array", `[]`, "", false},
		{"text", `plain text`, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var payload map[string]any
				json.NewDecoder(r.Body).Decode(&payload)
				if len(textArray(payload["system"])) < 2 {
					t.Error("missing JSON object instruction", payload)
				}
				json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": tc.answer}}, "stop_reason": "end_turn"})
			}))
			defer server.Close()
			payload := textTestPayload("claude-5.5-haiku")
			payload["response_format"] = map[string]any{"type": "json_object"}
			_, result, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Payload: payload})
			if (err == nil) != tc.valid {
				t.Fatalf("result=%v err=%v", result, err)
			}
			if !tc.valid {
				if result != nil {
					t.Fatal("invalid JSON returned as usable output")
				}
				return
			}
			message := textMap(textMap(textArray(result["choices"])[0])["message"])
			if textString(message["content"]) != tc.content {
				t.Fatalf("content %q", message["content"])
			}
		})
	}
}

func TestTextGeminiJSONSchemaResult(t *testing.T) {
	for _, answer := range []string{`{"ok":true}`, `not JSON`} {
		t.Run(answer, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				encoded, _ := json.Marshal(answer)
				io.WriteString(w, `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":`+string(encoded)+`}]}}]}`)
			}))
			defer server.Close()
			payload := textTestPayload("gemini-4-argon")
			payload["response_format"] = map[string]any{"type": "json_schema", "json_schema": map[string]any{"schema": map[string]any{"type": "object"}}}
			_, _, err := CompleteText(context.Background(), TextRequest{BaseURL: server.URL, Payload: payload})
			if (err == nil) != (answer != "not JSON") {
				t.Fatal(err)
			}
		})
	}
}

func TestAdaptiveDefaultOmitsLegacySampling(t *testing.T) {
	p := textTestPayload("claude-haiku-5-5")
	p["temperature"], p["top_p"] = .2, .9
	out, err := anthropicRequest(context.Background(), p, "claude-haiku-5-5", false)
	if err != nil || out["temperature"] != nil || out["top_p"] != nil || out["thinking"] != nil {
		t.Fatalf("default adaptive sampling: %v %v", out, err)
	}
}

func TestVerifiedCapabilityNormalization(t *testing.T) {
	for _, tc := range []struct{ model, effort, want string }{
		{"gemini-4-argon", "xhigh", "high"},
		{"gemini-3-pro-preview", "medium", "high"},
		{"claude-haiku-5-5", "xhigh", "xhigh"},
		{"claude-haiku-5-5", "max", "max"},
		{"claude-sonnet-4-6", "max", "max"},
		{"claude-sonnet-4-6", "xhigh", "high"},
		{"gemini-4-argon", "max", "high"},
		{"claude-5.5-haiku", "high", ""},
		{"gemini-unknown", "high", ""},
		{"claude-haiku-4-5-20251001", "high", "high"},
	} {
		if got := nativeTextEffort(tc.model, tc.effort); got != tc.want {
			t.Errorf("%s/%s: got %q want %q", tc.model, tc.effort, got, tc.want)
		}
	}
}

func TestUnknownNativeModelsOmitUnverifiedThinking(t *testing.T) {
	for _, protocol := range []string{"gemini", "anthropic"} {
		out := map[string]any{"max_tokens": 4096}
		p := map[string]any{"reasoning_effort": "high"}
		var err error
		if protocol == "gemini" {
			err = geminiReasoning(out, p, "gemini-private-alias")
		} else {
			err = anthropicReasoning(out, p, "claude-private-alias")
		}
		if err != nil || out["thinking"] != nil || out["thinkingConfig"] != nil || out["output_config"] != nil {
			t.Fatalf("%s unverified thinking: %v %v", protocol, out, err)
		}
	}
}

func TestGeminiReceivesInlineVideoWithoutTools(t *testing.T) {
	data := base64.StdEncoding.EncodeToString([]byte("\x00\x00\x00\x18ftypisomvideo"))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		parts := textArray(textMap(textArray(body["contents"])[0])["parts"])
		video := textMap(textMap(parts[1])["inlineData"])
		if video["mimeType"] != "video/mp4" || video["data"] != data || body["tools"] != nil {
			t.Error("native video bytes, MIME or direct request changed")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"视频分析完成\"}]},\"finishReason\":\"STOP\"}]}\n\n")
	}))
	defer server.Close()
	_, reply, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL, Protocol: "gemini", Payload: map[string]any{
		"model": "gemini-3.8-flash", "messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "text", "text": "分析视频"},
			map[string]any{"type": "video_url", "video_url": map[string]any{"url": "data:video/mp4;base64," + data}},
		}}},
	}}, nil)
	if err != nil || textString(textMap(textMap(textArray(reply["choices"])[0])["message"])["content"]) != "视频分析完成" {
		t.Fatalf("video completion: %v", err)
	}
}

func TestTextVideoRejectsInvalidSources(t *testing.T) {
	for _, source := range []string{"blob:local", "/storage/local/video.mp4", "https://example.com/video.mp4", "data:image/png;base64,AAAA", "data:video/mp4;base64,broken", "data:video/webm;base64," + base64.StdEncoding.EncodeToString([]byte("not a webm"))} {
		if _, _, err := textVideo(context.Background(), source); err == nil {
			t.Fatalf("invalid video source accepted: %s", source)
		}
	}
}

func TestTextUpstreamKeepsNestedErrorReasonAndRedactsKey(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error":{"message":"Invalid functionResponse for secret-token"}}`)
	}))
	defer server.Close()
	_, _, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL, APIKey: "secret-token", Protocol: "gemini", Payload: map[string]any{"model": "gemini-3.8-flash", "messages": []any{map[string]any{"role": "user", "content": "你好"}}}}, nil)
	if err == nil || !strings.Contains(err.Error(), "Invalid functionResponse") || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("upstream reason or redaction lost: %v", err)
	}
}

func TestComflyVideoUsesDocumentedImageURLPart(t *testing.T) {
	for _, tc := range []struct{ base, want string }{
		{"https://ai.comfly.org/v1", "image_url"},
		{"https://example.com/v1", "video_url"},
	} {
		part := map[string]any{"type": "video_url", "video_url": map[string]any{"url": "https://cdn.example/source.mp4"}, "fps": 2}
		payload := map[string]any{"messages": []any{map[string]any{"content": []any{part}}}}
		adaptComflyVideoParts(tc.base, payload)
		if part["type"] != tc.want {
			t.Fatalf("%s: got %v", tc.base, part)
		}
		if tc.want == "image_url" && textMap(part["image_url"])["url"] != "https://cdn.example/source.mp4" {
			t.Fatal(part)
		}
	}
}
