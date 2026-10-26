package review

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestReviewSendsHighestReasoningEffort(t *testing.T) {
	for _, model := range []string{"gpt-6.1-sol", "deepseek-v4.1-flash", "claude-sonnet-4-6"} {
		t.Run(model, func(t *testing.T) {
			var body map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				w.Header().Set("Content-Type", "application/json")
				content := `{"results":[["1","动物","制作","宠物用品",""]]}`
				response := map[string]any{"choices": []any{map[string]any{
					"finish_reason": "stop", "message": map[string]any{"content": content},
				}}}
				if model == "claude-sonnet-4-6" {
					response = map[string]any{"stop_reason": "end_turn", "content": []any{
						map[string]any{"type": "text", "text": content},
					}}
				}
				_ = json.NewEncoder(w).Encode(response)
			}))
			defer server.Close()
			result, err := Review(context.Background(), server.Client(), Input{
				BaseURL: server.URL, APIKey: "test-only", Model: model, Provider: "gateway",
				ReasoningEffort: "max", Rows: []Row{{ID: "row-1", Query: "猫砂"}},
			})
			if err != nil || len(result.Results) != 1 {
				t.Fatalf("result %#v err %v", result, err)
			}
			if model == "claude-sonnet-4-6" {
				if body["output_config"].(map[string]any)["effort"] != "max" {
					t.Fatalf("native effort %#v", body)
				}
			} else if body["reasoning_effort"] != "max" || body["thinking"] != nil {
				t.Fatalf("highest effort omitted or disabled: %#v", body)
			}
		})
	}
}
