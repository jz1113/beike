package review

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReviewGeminiNativePreservesTruncatedRows(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1beta/models/gemini-2.5-flash:generateContent" || r.Header.Get("x-goog-api-key") != "secret" {
			t.Errorf("native request %s", r.URL.Path)
		}
		var request map[string]any
		_ = json.NewDecoder(r.Body).Decode(&request)
		if request["contents"] == nil || request["systemInstruction"] == nil {
			t.Errorf("native body %#v", request)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates":    []any{map[string]any{"finishReason": "MAX_TOKENS", "content": map[string]any{"parts": []any{map[string]any{"text": `{"results":[["1","动物","制作","猫砂属于宠物用品",""],["2","美`}}}}},
			"usageMetadata": map[string]any{"promptTokenCount": 2, "candidatesTokenCount": 3, "totalTokenCount": 5},
		})
	}))
	defer server.Close()
	result, err := Review(context.Background(), server.Client(), Input{BaseURL: server.URL, APIKey: "secret", Model: "gemini-2.5-flash", Provider: "gateway", Rows: []Row{{ID: "a", Query: "猫砂"}, {ID: "b", Query: "菜谱"}}})
	if err != nil || len(result.Results) != 1 || len(result.Failed) != 1 || result.Failed[0] != "b" || calls != 1 {
		t.Fatalf("result %#v calls %d err %v", result, calls, err)
	}
	if !strings.Contains(string(result.Usage), `"total_tokens":5`) {
		t.Fatalf("usage %s", result.Usage)
	}
}
