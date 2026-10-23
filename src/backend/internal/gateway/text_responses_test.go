package gateway

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResponsesMultimodalAdapterPreservesRolesAndRejectsIncomplete(t *testing.T) {
	incomplete := false
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/responses" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatal("wrong provider route")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		input := body["input"].([]any)
		parts := input[0].(map[string]any)["content"].([]any)
		if body["store"] != false || len(parts) != 2 || parts[0].(map[string]any)["type"] != "input_text" || parts[1].(map[string]any)["image_url"] != "https://example.com/source" {
			t.Fatal("lost original image or role label")
		}
		if incomplete {
			_, _ = w.Write([]byte(`{"status":"incomplete","output_text":"truncated"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"complete rules"}]}],"usage":{"input_tokens":10,"output_tokens":20}}`))
	}))
	defer server.Close()
	request := TextRequest{BaseURL: server.URL + "/v1", APIKey: "test-key", Client: server.Client(), Payload: map[string]any{"model": "vision", "messages": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": "actual reference"}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://example.com/source"}}}}}}}
	status, data, err := CompleteResponses(context.Background(), request)
	if err != nil || status != 200 || !strings.Contains(textString(textMap(textMap(data["choices"].([]any)[0])["message"])["content"]), "complete rules") {
		t.Fatalf("status=%d err=%v", status, err)
	}
	incomplete = true
	if _, _, err := CompleteResponses(context.Background(), request); err == nil {
		t.Fatal("truncated output accepted")
	}
	if calls != 2 {
		t.Fatal("unexpected provider replay")
	}
}
