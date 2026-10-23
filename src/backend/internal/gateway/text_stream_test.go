package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func textSSEEvent(kind string, value any) string {
	b, _ := json.Marshal(value)
	prefix := ""
	if kind != "" {
		prefix = "event: " + kind + "\n"
	}
	return prefix + "data: " + string(b) + "\n\n"
}

func textClaudeEvent(kind string, fields map[string]any) string {
	fields["type"] = kind
	return textSSEEvent(kind, fields)
}

func textClaudeToolStream() string {
	return textClaudeEvent("message_start", map[string]any{"message": map[string]any{"id": "m1", "usage": map[string]any{"input_tokens": 10, "output_tokens": 0}}}) +
		textClaudeEvent("content_block_start", map[string]any{"index": 0, "content_block": map[string]any{"type": "thinking", "thinking": "", "signature": ""}}) +
		textClaudeEvent("content_block_delta", map[string]any{"index": 0, "delta": map[string]any{"type": "thinking_delta", "thinking": "plan"}}) +
		textClaudeEvent("content_block_delta", map[string]any{"index": 0, "delta": map[string]any{"type": "signature_delta", "signature": "private-signature"}}) +
		textClaudeEvent("content_block_stop", map[string]any{"index": 0}) +
		textClaudeEvent("content_block_start", map[string]any{"index": 1, "content_block": map[string]any{"type": "tool_use", "id": "c1", "name": "search", "input": map[string]any{}, "extra_content": map[string]any{"keep": true}}}) +
		textClaudeEvent("content_block_delta", map[string]any{"index": 1, "delta": map[string]any{"type": "input_json_delta", "partial_json": "{\"q\":"}}) +
		textClaudeEvent("content_block_delta", map[string]any{"index": 1, "delta": map[string]any{"type": "input_json_delta", "partial_json": "\"hi\"}"}}) +
		textClaudeEvent("content_block_stop", map[string]any{"index": 1}) +
		textClaudeEvent("message_delta", map[string]any{"delta": map[string]any{"stop_reason": "tool_use"}, "usage": map[string]any{"output_tokens": 7}}) +
		textClaudeEvent("message_stop", map[string]any{})
}

func TestTextClaudeStreamToolSignature(t *testing.T) {
	emitted := ""
	result, err := readAnthropicStream(strings.NewReader(textClaudeToolStream()), "claude-5.5-haiku", func(kind, text string) { emitted += kind + ":" + text })
	if err != nil {
		t.Fatal(err)
	}
	if emitted != "reasoning:plan" || strings.Contains(emitted, "signature") {
		t.Fatal(emitted)
	}
	msg := textTestMessage(result)
	blocks := textArray(textMap(msg["native_content"])["content"])
	if textMap(blocks[0])["signature"] != "private-signature" {
		t.Fatal(msg)
	}
	call := textMap(textArray(msg["tool_calls"])[0])
	if textMap(call["function"])["arguments"] != `{"q":"hi"}` || call["extra_content"] == nil {
		t.Fatal(call)
	}
	if textMap(result["usage"])["completion_tokens"] != float64(7) {
		t.Fatal(result)
	}
}

func TestTextGeminiStreamToolsAndSignature(t *testing.T) {
	stream := textSSEEvent("", map[string]any{"candidates": []any{map[string]any{"index": 0, "content": map[string]any{"parts": []any{map[string]any{"text": "think", "thought": true}}}}}}) +
		textSSEEvent("", map[string]any{"candidates": []any{map[string]any{"index": 0, "content": map[string]any{"parts": []any{map[string]any{"text": " more", "thought": true, "thoughtSignature": "private-sig"}}}}}}) +
		textSSEEvent("", map[string]any{"candidates": []any{map[string]any{"index": 0, "content": map[string]any{"parts": []any{map[string]any{"functionCall": map[string]any{"name": "search", "args": map[string]any{"q": "hi"}}, "thoughtSignature": "tool-sig"}}}, "finishReason": "STOP"}}, "usageMetadata": map[string]any{"promptTokenCount": 10, "candidatesTokenCount": 2, "thoughtsTokenCount": 4, "totalTokenCount": 16}})
	emitted := ""
	result, err := readGeminiStream(strings.NewReader(stream), "gemini-4-argon", func(kind, text string) { emitted += kind + ":" + text })
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(emitted, "sig") || !strings.Contains(emitted, "think") {
		t.Fatal(emitted)
	}
	msg := textTestMessage(result)
	blocks := textArray(textMap(msg["native_content"])["content"])
	if len(blocks) != 2 || textMap(blocks[0])["text"] != "think more" || textMap(blocks[0])["thoughtSignature"] != "private-sig" {
		t.Fatal(blocks)
	}
	if len(textArray(msg["tool_calls"])) != 1 || textMap(result["usage"])["completion_tokens"] != float64(6) {
		t.Fatal(result)
	}
}

func textOpenAIToolStream() string {
	first := map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"content": "hello", "reasoning_content": "plan", "tool_calls": []any{map[string]any{"index": 0, "id": "c1", "type": "function", "function": map[string]any{"name": "search", "arguments": "{\"q\":"}, "extra_content": map[string]any{"google": map[string]any{"thought_signature": "private"}}}}}}}}
	second := map[string]any{"choices": []any{map[string]any{"index": 0, "delta": map[string]any{"tool_calls": []any{map[string]any{"index": 0, "function": map[string]any{"arguments": "\"hi\"}"}}}}, "finish_reason": "tool_calls"}}}
	return textSSEEvent("", first) + textSSEEvent("", second) + textSSEEvent("", map[string]any{"choices": []any{}, "usage": map[string]any{"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}}) + "data: [DONE]\n\n"
}

func TestTextOpenAIStreamToolsExtraContent(t *testing.T) {
	emitted := ""
	result, err := readOpenAIStream(strings.NewReader(textOpenAIToolStream()), "gpt-test", func(kind, text string) { emitted += kind + ":" + text })
	if err != nil {
		t.Fatal(err)
	}
	msg := textTestMessage(result)
	if msg["content"] != "hello" || msg["reasoning_content"] != "plan" || strings.Contains(emitted, "private") {
		t.Fatal(msg, emitted)
	}
	if textMap(textArray(msg["tool_calls"])[0])["extra_content"] == nil {
		t.Fatal(msg)
	}
	if textMap(result["usage"])["total_tokens"] != float64(7) {
		t.Fatal(result)
	}
}

func TestTextStreamAcceptsBufferedJSONCompletion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["stream"] != true {
			t.Errorf("stream %#v", body["stream"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}]}`)
	}))
	defer server.Close()
	status, result, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL, Payload: textTestPayload("gpt-test")}, nil)
	if err != nil || status != 200 || textTestMessage(result)["content"] != "hello" {
		t.Fatalf("status=%d result=%v err=%v", status, result, err)
	}
}

func TestTextStreamRejectsNonJSONWhenSSEIsMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, "<html>timeout</html>")
	}))
	defer server.Close()
	_, _, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL, Payload: textTestPayload("gpt-test")}, nil)
	if err == nil || !strings.Contains(err.Error(), "did not return SSE") {
		t.Fatal(err)
	}
}

func TestTextStreamHTTPProtocolAndPath(t *testing.T) {
	for _, protocol := range []string{"gemini", "anthropic", "openai"} {
		t.Run(protocol, func(t *testing.T) {
			model, stream := "gpt-test", textOpenAIToolStream()
			if protocol == "anthropic" {
				model = "claude-5.5-haiku"
				stream = textClaudeToolStream()
			}
			if protocol == "gemini" {
				model = "gemini-4-argon"
				stream = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"hello\"}]},\"finishReason\":\"STOP\"}]}\n\n"
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if protocol == "gemini" && (!strings.HasSuffix(r.URL.Path, ":streamGenerateContent") || r.URL.RawQuery != "alt=sse") {
					t.Error(r.URL.String())
				}
				var body map[string]any
				json.NewDecoder(r.Body).Decode(&body)
				if protocol != "gemini" && body["stream"] != true {
					t.Error(body)
				}
				w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
				io.WriteString(w, stream)
			}))
			defer server.Close()
			status, result, err := StreamText(context.Background(), TextRequest{BaseURL: server.URL + "/custom", Payload: textTestPayload(model)}, nil)
			if err != nil || status != 200 || result == nil {
				t.Fatalf("%d %v %v", status, result, err)
			}
		})
	}
}

func TestTextSSEMultilineCRLFAndComments(t *testing.T) {
	stream := ": keepalive\r\nevent: message\r\ndata: {\"a\":\r\ndata: 1}\r\n\r\n"
	called := false
	err := readTextSSE(strings.NewReader(stream), func(event string, data []byte) (bool, error) {
		called = true
		if event != "message" || string(data) != "{\"a\":\n1}" {
			t.Fatalf("%q %q", event, data)
		}
		return false, nil
	})
	if err != nil || !called {
		t.Fatal(err, called)
	}
}

func TestTextStreamsRejectTruncationAndErrors(t *testing.T) {
	for _, tc := range []struct{ protocol, body string }{
		{"openai", strings.TrimSuffix(textOpenAIToolStream(), "data: [DONE]\n\n")},
		{"openai", strings.Replace(textOpenAIToolStream(), `hi\"}`, `hi\"`, 1)},
		{"anthropic", strings.TrimSuffix(textClaudeToolStream(), textClaudeEvent("message_stop", map[string]any{}))},
		{"anthropic", strings.Replace(textClaudeToolStream(), `hi\"}`, `hi\"`, 1)},
		{"gemini", `data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"f","args":{}}}]}}]}` + "\n\n"},
		{"gemini", `data: {"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"functionCall":{"name":"f","args":{}}}]}}]}` + "\n\n"},
		{"openai", "event: error\ndata: {\"message\":\"bad\"}\n\n"},
		{"gemini", "data: {\"error\":{\"message\":\"bad\"}}\n\n"},
		{"anthropic", "data: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\"}}\n\n"},
		{"openai", "data: not JSON\n\n"}, {"openai", "data: [DONE]"},
	} {
		t.Run(fmt.Sprintf("%s-%d", tc.protocol, len(tc.body)), func(t *testing.T) {
			result, err := readTextStream(strings.NewReader(tc.body), tc.protocol, "test", nil)
			if err == nil || result != nil {
				t.Fatalf("unsafe stream accepted result=%v err=%v body=%s", result, err, tc.body)
			}
		})
	}
}

func TestTextSSESizeLimit(t *testing.T) {
	if err := readTextSSE(strings.NewReader("data: "+strings.Repeat("x", textSSEEventLimit+1)+"\n\n"), func(string, []byte) (bool, error) { return false, nil }); err == nil {
		t.Fatal("oversized event accepted")
	}
}
