package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/network"
)

var ModelHTTP = func() *http.Client { return network.SafeClient() }

func PostModel(ctx context.Context, method, endpoint, apiKey string, payload any, timeout time.Duration) (int, []byte, error) {
	return PostModelHeaders(ctx, method, endpoint, apiKey, payload, timeout, nil)
}

func PostModelHeaders(ctx context.Context, method, endpoint, apiKey string, payload any, timeout time.Duration, headers map[string]string) (int, []byte, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		body = bytes.NewReader(encoded)
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, method, endpoint, body)
	if err != nil {
		return 0, nil, err
	}
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		if strings.EqualFold(key, "Host") || strings.EqualFold(key, "Cookie") || strings.TrimSpace(value) == "" {
			continue
		}
		request.Header.Set(key, value)
	}
	if apiKey != "" && request.Header.Get("Authorization") == "" {
		request.Header.Set("Authorization", "Bearer "+apiKey)
	}
	response, err := ModelHTTP().Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	return response.StatusCode, raw, err
}

func ChatCompletion(ctx context.Context, base, apiKey, model string, messages any, temperature float64, timeout time.Duration) (string, map[string]any, int, error) {
	return chatCompletion(ctx, base, apiKey, model, messages, temperature, timeout, false, "")
}

func ChatCompletionJSON(ctx context.Context, base, apiKey, model string, messages any, temperature float64, timeout time.Duration) (string, map[string]any, int, error) {
	return chatCompletion(ctx, base, apiKey, model, messages, temperature, timeout, true, "")
}

// ChatCompletionJSONWithEffort adds a verified reasoning level. Official DeepSeek routes stay on the existing disabled-thinking payload.
func ChatCompletionJSONWithEffort(ctx context.Context, base, apiKey, model string, messages any, temperature float64, timeout time.Duration, effort string) (string, map[string]any, int, error) {
	return chatCompletion(ctx, base, apiKey, model, messages, temperature, timeout, true, effort)
}

func chatCompletion(ctx context.Context, base, apiKey, model string, messages any, temperature float64, timeout time.Duration, jsonObject bool, effort string) (string, map[string]any, int, error) {
	payload := map[string]any{
		"model":       wireModel(model),
		"messages":    messages,
		"temperature": temperature,
	}
	if jsonObject {
		payload["response_format"] = map[string]any{"type": "json_object"}
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		payload["thinking"] = map[string]any{"type": "disabled"}
	} else if effort != "" {
		payload["reasoning_effort"] = effort
	}
	return ChatCompletionPayload(ctx, base, apiKey, payload, timeout)
}

// ChatCompletionPayload preserves caller-specific limits and injected HTTP clients
// while routing OpenAI-compatible input through the selected native protocol.
func ChatCompletionPayload(ctx context.Context, base, apiKey string, payload map[string]any, timeout time.Duration) (string, map[string]any, int, error) {
	model, _ := payload["model"].(string)
	status, data, err := gateway.CompleteText(ctx, gateway.TextRequest{
		BaseURL: base, APIKey: apiKey, Protocol: gateway.TextProtocol(ctx, model),
		Payload: payload, Client: ModelHTTP(), Timeout: timeout,
	})
	if err != nil {
		return "", data, status, err
	}
	if status != 0 && (status < 200 || status >= 300) && data != nil {
		return "", data, status, errors.New(imageUpstreamError(data, status))
	}
	return chatContent(data), data, status, nil
}

func wireModel(model string) string {
	model = strings.TrimSpace(model)
	if strings.HasPrefix(model, "deepseek-official:") {
		return strings.TrimPrefix(model, "deepseek-official:")
	}
	if strings.HasPrefix(model, "openai-responses:") {
		return strings.TrimPrefix(model, "openai-responses:")
	}
	return model
}

func chatContent(data map[string]any) string {
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return ""
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	return strings.TrimSpace(text)
}

// NormalizeUsage reads an upstream usage object from the top level or data.usage.
// Token counts use prompt/input and completion/output names. A response with no tokens returns nil.
func NormalizeUsage(data map[string]any) map[string]any {
	usage := usageObject(data)
	if usage == nil {
		return nil
	}
	prompt := usageNumber(usage, "prompt_tokens", "promptTokens", "input_tokens", "inputTokens", "promptTokenCount")
	completion := usageNumber(usage, "completion_tokens", "completionTokens", "output_tokens", "outputTokens", "candidatesTokenCount")
	if thoughts := usageNumber(usage, "thoughtsTokenCount"); thoughts > 0 && usageNumber(usage, "completion_tokens", "completionTokens") == 0 {
		completion += thoughts
	}
	total := usageNumber(usage, "total_tokens", "totalTokens", "totalTokenCount")
	if total == 0 {
		total = prompt + completion
	}
	if prompt == 0 && completion == 0 && total == 0 {
		return nil
	}
	return map[string]any{"promptTokens": prompt, "completionTokens": completion, "totalTokens": total}
}

func usageObject(data map[string]any) map[string]any {
	if data == nil {
		return nil
	}
	if usage, ok := data["usage"].(map[string]any); ok {
		return usage
	}
	if usage, ok := data["usageMetadata"].(map[string]any); ok {
		return usage
	}
	if nested, ok := data["data"].(map[string]any); ok {
		if usage, ok := nested["usage"].(map[string]any); ok {
			return usage
		}
		if usage, ok := nested["usageMetadata"].(map[string]any); ok {
			return usage
		}
	}
	return nil
}

func usageNumber(data map[string]any, keys ...string) float64 {
	if data == nil {
		return 0
	}
	for _, key := range keys {
		switch value := data[key].(type) {
		case float64:
			if value > 0 {
				return value
			}
		case int:
			if value > 0 {
				return float64(value)
			}
		case int64:
			if value > 0 {
				return float64(value)
			}
		case json.Number:
			parsed, err := value.Float64()
			if err == nil && parsed > 0 {
				return parsed
			}
		case string:
			parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
			if err == nil && parsed > 0 {
				return parsed
			}
		}
	}
	return 0
}

func EncodeUsage(usage map[string]any) string {
	if usage == nil {
		return ""
	}
	raw, err := json.Marshal(usage)
	if err != nil {
		return ""
	}
	return string(raw)
}

func DecodeUsage(raw string) map[string]any {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var usage map[string]any
	if json.Unmarshal([]byte(raw), &usage) != nil {
		return nil
	}
	return NormalizeUsage(map[string]any{"usage": usage})
}

func attachUsage(body, source map[string]any) {
	if usage := NormalizeUsage(source); usage != nil {
		body["usage"] = usage
	}
}

func DecodeObject(text string) map[string]any {
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)
	var data map[string]any
	if json.Unmarshal([]byte(text), &data) == nil {
		return data
	}
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start >= 0 && end > start && json.Unmarshal([]byte(text[start:end+1]), &data) == nil {
		return data
	}
	return nil
}
