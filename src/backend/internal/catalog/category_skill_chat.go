package catalog

import (
	"context"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
)

func categorySkillChat(ctx context.Context, base, key, model string, payload map[string]any, content []any) (string, int, map[string]any, error) {
	if styleString(payload, "apiFormat") != "openai-responses" {
		return styleChat(ctx, base, key, model, content)
	}
	status, data, err := gateway.CompleteResponses(ctx, gateway.TextRequest{BaseURL: base, APIKey: key, Client: styleHTTP(), Timeout: 120 * time.Second, Payload: map[string]any{"model": model, "messages": []any{map[string]any{"role": "user", "content": content}}}})
	if err != nil {
		return "", status, nil, err
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return "", status, nil, nil
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	return styleString(message, "content"), status, generate.NormalizeUsage(data), nil
}
