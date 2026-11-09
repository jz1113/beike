// Package gateway adapts vendor generation protocols.
package gateway

import (
	"beike.local/cloud/src/backend/internal/platform/network"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
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
	status, data, err := CompleteText(ctx, TextRequest{
		BaseURL: base, APIKey: apiKey, Protocol: TextProtocolForBase(ctx, model, base),
		Payload: payload, Client: ModelHTTP(), Timeout: timeout,
	})
	if err != nil {
		return "", data, status, err
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

var imageModelIDs = []string{
	"gpt-image-2.5-flare",
	"gpt-image-2.5-sunburst",
	"gpt-image-2",
	"gemini-nano-banana-2.1",
	"gemini-3.1-flash-image",
	"gemini-3.1-flash-lite-image",
	"gemini-3-pro-image",
	"gemini-2.5-flash-image",
	"nano-banana-pro",
	"nano-banana",
	"doubao-seedream-4-0-250828",
	"doubao-seedream-4-5-251128",
	"doubao-seedream-5-0-260128",
	"seedream-v5-pro",
	"qwen-image-max",
	"z-image-turbo",
	"qwen-image",
	"qwen-image-edit",
	"midjourney",
	"flux",
	"flux-pro-max",
	"grok-4.1-image",
	"grok-4.2-image",
	"grok-imagine-image-quality",
}

var modelAliases = map[string]string{
	"nano-banana-2.1":                     "gemini-nano-banana-2.1",
	"nano-banana-2":                       "gemini-3.1-flash-image",
	"nano-banana-2-lite":                  "gemini-3.1-flash-lite-image",
	"gemini-3.1-flash-image-preview":      "gemini-3.1-flash-image",
	"gemini-3.1-flash-lite-image-preview": "gemini-3.1-flash-lite-image",
	"gemini-3-pro-image-preview":          "gemini-3-pro-image",
	"gemini-2.5-flash-image-preview":      "gemini-2.5-flash-image",
	"qwen-image-3":                        "qwen-image-max",
	"qwen-image-edit-2509":                "qwen-image-edit",
	"mjv7":                                "midjourney",
	"mjv8.1":                              "midjourney",
	"mjv8.2":                              "midjourney",
	"vidu-q4-preview":                     "viduq4-preview",
	"viduq4":                              "viduq4-preview",
}

var videoModelIDs = []string{
	"veo3.1",
	"veo3.1-fast",
	"veo3.1-pro",
	"omni_flash-10s",
	"kling-video-v3",
	"kling-video-v3-omni",
	"kling-video-v2-5-turbo",
	"kling-video-v2-6",
	"doubao-seedance-2-0-260128",
	"doubao-seedance-2-0-fast-260128",
	"doubao-seedance-2.0-mini",
	"doubao-seedance-2.5",
	"sora-2",
	"sora-2-pro",
	"MiniMax-H3",
	"wan3.0-video",
	"wan3.0-video-prime",
	"grok-imagine-video-1.5",
	"viduq3",
	"viduq3-mix",
	"viduq3-turbo",
	"viduq3-pro",
	"viduq4-preview",
}

func IsApprovedImage(id string) bool { return approvedModel(id, imageModelIDs) }

func IsApprovedVideo(id string) bool { return approvedModel(id, videoModelIDs) }

func approvedModel(id string, ids []string) bool {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" {
		return false
	}
	known := map[string]struct{}{}
	for _, item := range ids {
		known[strings.ToLower(item)] = struct{}{}
	}
	if _, ok := known[strings.ToLower(trimmed)]; ok {
		return true
	}
	slash := strings.LastIndex(trimmed, "/")
	stripped := trimmed
	if slash >= 0 {
		stripped = trimmed[slash+1:]
	}
	canonical := stripped
	if alias, ok := modelAliases[stripped]; ok {
		canonical = alias
	} else if alias, ok := modelAliases[strings.ToLower(stripped)]; ok {
		canonical = alias
	}
	_, ok := known[strings.ToLower(canonical)]
	return ok
}

// CanTryAnotherEndpoint reports whether a failed submit may try the next
// endpoint. Timeouts, 5xx and missing task ids must not submit again.
func CanTryAnotherEndpoint(status int) bool {
	return status == 404 || status == 405 || status == 415
}

// IsDashScopeGateway reports hosts that speak the Qianwen / DashScope native API.
func IsDashScopeGateway(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return false
	}
	if host == "qianwenaiapi.com" || host == "maas.qianwenaiapi.com" || strings.HasSuffix(host, ".qianwenaiapi.com") {
		return true
	}
	return strings.Contains(host, "dashscope") && (host == "aliyuncs.com" || strings.HasSuffix(host, ".aliyuncs.com"))
}

// ChatCompletionsURL is the OpenAI-compatible chat endpoint for a provider base URL.
// DashScope hosts use /compatible-mode/v1 unless that prefix is already present.
func ChatCompletionsURL(base string) string {
	return openAICompatibleRoot(base) + "/chat/completions"
}

// ModelsURL is the OpenAI-compatible model catalog endpoint for a provider base URL.
func ModelsURL(base string) string {
	return openAICompatibleRoot(base) + "/models"
}

// DashScopeRoot strips compatible-mode and /api/v1 suffixes so native image paths can be appended.
func DashScopeRoot(base string) string {
	root := strings.TrimRight(NormalizeGatewayBaseURL(base), "/")
	lower := strings.ToLower(root)
	for _, suffix := range []string{"/compatible-mode", "/api"} {
		if strings.HasSuffix(lower, suffix) {
			root = strings.TrimRight(root[:len(root)-len(suffix)], "/")
			lower = strings.ToLower(root)
		}
	}
	return root
}

func openAICompatibleRoot(base string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(base), "/")
	lower := strings.ToLower(trimmed)
	if strings.HasSuffix(lower, "/compatible-mode/v1") {
		return trimmed
	}
	if IsDashScopeGateway(trimmed) {
		return DashScopeRoot(trimmed) + "/compatible-mode/v1"
	}
	return strings.TrimRight(NormalizeGatewayBaseURL(trimmed), "/") + "/v1"
}

func NormalizeGatewayBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimRight(trimmed, "/")
	if len(trimmed) >= 3 && strings.EqualFold(trimmed[len(trimmed)-3:], "/v1") {
		trimmed = trimmed[:len(trimmed)-3]
	}
	return trimmed
}
