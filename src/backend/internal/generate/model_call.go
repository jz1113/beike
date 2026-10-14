package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

var ModelHTTP = func() *http.Client { return network.SafeClient() }

func PostModel(ctx context.Context, method, endpoint, apiKey string, payload any, timeout time.Duration) (int, []byte, error) {
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
	if apiKey != "" {
		request.Header.Set("Authorization", "Bearer "+apiKey)
	}
	response, err := ModelHTTP().Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	return response.StatusCode, raw, err
}

func ChatCompletion(ctx context.Context, base, apiKey, model string, messages any, temperature float64, timeout time.Duration) (string, map[string]any, int, error) {
	payload := map[string]any{
		"model":           wireModel(model),
		"messages":        messages,
		"temperature":     temperature,
		"response_format": map[string]any{"type": "json_object"},
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		payload["thinking"] = map[string]any{"type": "disabled"}
	}
	status, raw, err := PostModel(ctx, http.MethodPost, strings.TrimRight(system.NormalizeGatewayBaseURL(base), "/")+"/v1/chat/completions", apiKey, payload, timeout)
	if err != nil {
		return "", nil, status, err
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		data = map[string]any{}
	}
	if status < 200 || status >= 300 {
		return "", data, status, errStatus(status)
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

type statusError int

func (e statusError) Error() string { return "HTTP " + Itoa(int(e)) }

func errStatus(status int) error { return statusError(status) }
