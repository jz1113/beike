package sales

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSummaryAcceptsRegisteredDeepSeekTextModelsOnOfficialRoute(t *testing.T) {
	for _, model := range []string{"deepseek-flash", "deepseek-v4-pro"} {
		t.Run(model, func(t *testing.T) {
			body := exampleSummaryRequest()
			body.Model, body.CustomBaseURL = "deepseek-official:"+model, "https://api.deepseek.com"
			handler := summaryHandler(setupPromptExecutionTestConfig(t), func(ctx context.Context, req gateway.TextRequest, responses bool) (int, map[string]any, error) {
				if req.BaseURL != "https://api.deepseek.com" || req.APIKey != "chosen-key" || req.Payload["model"] != model || req.Protocol != "openai" {
					t.Fatalf("official text model lost its route or credentials: model=%v base=%q protocol=%q", req.Payload["model"], req.BaseURL, req.Protocol)
				}
				messages := req.Payload["messages"].([]any)
				content := messages[1].(map[string]any)["content"].([]any)
				if len(content) != 1 || content[0].(map[string]any)["type"] != "text" {
					t.Fatal("official text model received non-text content")
				}
				return http.StatusOK, summaryCompletion(exampleSummaryResult()), nil
			}, func(context.Context, string, string) ([]byte, error) {
				t.Fatal("official text model read an image")
				return nil, nil
			})
			if w := serveSummary(handler, body); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), model) {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestSummaryDeepSeekRejectsUnknownModelsAndForeignRoutesWithoutDefaultKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "server-secret")
	t.Setenv("AI_API_KEY", "server-secret")
	for _, test := range []struct {
		name, model, base, key string
	}{
		{"unregistered", "deepseek-official:unregistered", "", "chosen-key"},
		{"foreign base", "deepseek-official:deepseek-v4-pro", "https://foreign.test", "chosen-key"},
		{"missing official key", "deepseek-official:deepseek-v4-pro", "", ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := exampleSummaryRequest()
			body.Model, body.CustomBaseURL, body.CustomAPIKey = test.model, test.base, test.key
			_, key, _, message := summaryCredentials(config.Config{}, httptest.NewRequest("POST", "/", nil), body)
			if message == "" || key != "" || strings.Contains(message, "server-secret") {
				t.Fatalf("invalid official model route accepted or default credential leaked: %q", message)
			}
		})
	}
}
