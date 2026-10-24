package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNativeGeminiStreamPreservesSignedToolCalls(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1beta/models/gemini-4-argon:streamGenerateContent" || r.URL.Query().Get("alt") != "sse" || r.Header.Get("x-goog-api-key") != "test-key" {
			t.Errorf("native request %s %v", r.URL, r.Header)
		}
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		encoded, _ := json.Marshal(payload)
		if strings.Contains(string(encoded), "reasoning_effort") {
			t.Error("OpenAI effort sent to Gemini")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		if calls == 1 {
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"name\":\"update_plan\",\"args\":{\"steps\":[]}},\"thoughtSignature\":\"signed-tool-block\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":2,\"candidatesTokenCount\":1,\"thoughtsTokenCount\":3,\"totalTokenCount\":6}}\n\n")
			return
		}
		if strings.Contains(string(encoded), `"id":"call_gemini_0"`) {
			t.Error("local tool ID was incorrectly sent as a vendor call ID")
		}
		if !strings.Contains(string(encoded), "signed-tool-block") || !strings.Contains(string(encoded), "functionResponse") {
			t.Errorf("tool signature or result lost: %s", encoded)
		}
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"已完成\",\"thoughtSignature\":\"signed-final-block\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":3,\"candidatesTokenCount\":2,\"totalTokenCount\":5}}\n\n")
	}))
	defer server.Close()
	loop := testLoop(server.URL, func(event map[string]any) {
		encoded, _ := json.Marshal(event)
		if strings.Contains(string(encoded), "signed-tool-block") {
			t.Error("signature leaked to UI")
		}
	})
	loop.creds = gatewayCreds{baseURL: server.URL, apiKey: "test-key"}
	loop.models = []string{"gemini-4-argon"}
	loop.effort = "high"
	loop.tools = []map[string]any{{"type": "function", "function": map[string]any{"name": "update_plan", "parameters": map[string]any{"type": "object", "properties": map[string]any{}}}}}
	first, err := loop.complete(false, true)
	if err != nil || len(first.toolCalls) != 1 || first.native == nil {
		t.Fatalf("first=%+v error=%v", first, err)
	}
	loop.pushToolMessage(first)
	loop.messages = append(loop.messages, map[string]any{"role": "tool", "tool_call_id": first.toolCalls[0].id, "content": `{"success":true}`})
	last, err := loop.complete(true, false)
	if err != nil || last.content != "已完成" || last.native == nil || calls != 2 {
		t.Fatalf("last=%+v requests=%d error=%v", last, calls, err)
	}
}

func TestNativeStreamFailureDoesNotRetryOrSwitchProtocol(t *testing.T) {
	for _, status := range []int{400, 401, 429, 502} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.WriteHeader(status)
				fmt.Fprint(w, `{"error":{"message":"native unavailable"}}`)
			}))
			defer server.Close()
			loop := testLoop(server.URL, func(map[string]any) {})
			loop.creds.protocol = "gemini"
			loop.models = []string{"gemini-4-argon", "gemini-3.8-flash", "gpt-6-sol"}
			if _, err := loop.complete(true, false); err == nil || requests != 1 {
				t.Fatalf("requests=%d error=%v", requests, err)
			}
		})
	}
}

func TestNativeModelRoundRejectsInvalidArguments(t *testing.T) {
	data := map[string]any{"choices": []any{map[string]any{"finish_reason": "tool_calls", "message": map[string]any{"tool_calls": []any{map[string]any{"id": "call-1", "function": map[string]any{"name": "execute_code", "arguments": "{incomplete"}}}}}}}
	if _, err := nativeModelRound(data); err == nil {
		t.Fatal("incomplete call accepted")
	}
}

func TestNativeTurnProtocolAndEffortValidation(t *testing.T) {
	for _, input := range []string{`{"messages":[{"role":"user","content":"hi"}],"textProtocol":"invalid"}`, `{"messages":[{"role":"user","content":"hi"}],"reasoningEffort":"extreme"}`} {
		var payload map[string]json.RawMessage
		_ = json.Unmarshal([]byte(input), &payload)
		if turnStartError(payload) == "" {
			t.Fatalf("accepted invalid request %s", input)
		}
	}
	if nativeRouteHash(gatewayCreds{baseURL: "https://gateway.example", apiKey: "one"}) == nativeRouteHash(gatewayCreds{baseURL: "https://gateway.example", apiKey: "two"}) {
		t.Fatal("continuation credential isolation lost")
	}
}

func TestNativeCancelledRequestDoesNotCallUpstream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	loop := testLoop("https://gateway.example", func(map[string]any) {})
	loop.ctx = ctx
	loop.creds.protocol = "anthropic"
	if _, err := loop.complete(true, false); err == nil {
		t.Fatal("cancelled request accepted")
	}
}
