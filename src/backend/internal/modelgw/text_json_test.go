package modelgw

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

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
