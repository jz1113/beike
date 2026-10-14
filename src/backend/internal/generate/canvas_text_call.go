package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

const deepseekOfficialBase = "https://api.deepseek.com"

var canvasHTTP = func() *http.Client { return network.SafeClient() }

func writeCanvasText(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any, _ []byte) {
	model, _ := payload["model"].(string)
	prompt, _ := payload["prompt"].(string)
	base, key, upstream, status, message := canvasCredentials(cfg, r, payload, model)
	if message != "" {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	format, _ := payload["apiFormat"].(string)
	var text string
	if format == "openai-responses" {
		text, status, message = completeCanvasResponses(r.Context(), base, key, upstream, prompt)
	} else {
		text, status, message = completeCanvasText(r.Context(), base, key, upstream, strings.HasPrefix(model, "deepseek-official:"), prompt)
	}
	if message != "" {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "text": text})
}

func canvasCredentials(cfg config.Config, r *http.Request, payload map[string]any, model string) (string, string, string, int, string) {
	bodyKey, _ := payload["customApiKey"].(string)
	key := strings.TrimSpace(bodyKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	bodyBase, _ := payload["customBaseUrl"].(string)
	clientBase := strings.TrimSpace(bodyBase)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		id := strings.TrimPrefix(model, "deepseek-official:")
		if id != "deepseek-flash" && id != "deepseek-v4-pro" {
			return "", "", "", http.StatusBadRequest, "此 DeepSeek 官方模型尚未适配"
		}
		if clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != deepseekOfficialBase {
			return "", "", "", http.StatusBadRequest, "DeepSeek 官方模型只能使用官方接口地址"
		}
		if key == "" {
			return "", "", "", http.StatusBadGateway, "请先配置文本模型的 API Key"
		}
		return deepseekOfficialBase, key, id, 0, ""
	}
	defaults := defaultCanvasBase()
	base := defaults
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	upstream := model
	if strings.HasPrefix(model, "openai-responses:") {
		upstream = strings.TrimPrefix(model, "openai-responses:")
	}
	thirdParty := clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != system.NormalizeGatewayBaseURL(defaults)
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	if key == "" {
		return "", "", "", http.StatusBadGateway, "请先配置文本模型的 API Key"
	}
	return base, key, upstream, 0, ""
}

func defaultCanvasBase() string {
	if value := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL")); value != "" {
		return value
	}
	return "https://ai.comfly.org"
}

func completeCanvasText(ctx context.Context, base, key, model string, deepseek bool, prompt string) (string, int, string) {
	content := "根据以下要求生成可直接使用的文字。仅返回正文，可以使用 Markdown 排版。\n\n" + prompt
	body := map[string]any{
		"model": model,
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "text", "text": content},
		}}},
		"max_tokens": 4096,
		"stream":     false,
	}
	if deepseek {
		body["thinking"] = map[string]any{"type": "disabled"}
	}
	encoded, _ := json.Marshal(body)
	requestCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, strings.TrimRight(base, "/")+"/v1/chat/completions", bytes.NewReader(encoded))
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试"
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := canvasHTTP().Do(request)
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试"
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", http.StatusBadGateway, "文本生成失败（HTTP " + itoa(response.StatusCode) + "），请检查模型配置后重试"
	}
	text, message := canvasTextFromChat(raw)
	if message != "" {
		return "", http.StatusBadGateway, message
	}
	return text, 0, ""
}

func canvasTextFromChat(raw []byte) (string, string) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return "", "模型没有返回文字"
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return "", "模型没有返回文字"
	}
	choice, _ := choices[0].(map[string]any)
	if choice["finish_reason"] != "stop" {
		return "", "模型未完整返回正文，请调整要求后重试"
	}
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	text = strings.TrimSpace(text)
	if text == "" {
		return "", "模型没有返回文字"
	}
	return text, ""
}

func completeCanvasResponses(ctx context.Context, base, key, model, prompt string) (string, int, string) {
	content := "根据以下要求生成可直接使用的文字。仅返回正文，可以使用 Markdown 排版。\n\n" + prompt
	body := map[string]any{
		"model":             model,
		"input":             []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "input_text", "text": content}}}},
		"max_output_tokens": 4096,
		"store":             false,
	}
	encoded, _ := json.Marshal(body)
	requestCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, strings.TrimRight(base, "/")+"/v1/responses", bytes.NewReader(encoded))
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试"
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := canvasHTTP().Do(request)
	if err != nil {
		return "", http.StatusBadGateway, "文本生成失败，请重试"
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", http.StatusBadGateway, "文本生成失败（HTTP " + itoa(response.StatusCode) + "），请检查模型配置后重试"
	}
	text, message := canvasTextFromResponses(raw)
	if message != "" {
		return "", http.StatusBadGateway, message
	}
	return text, 0, ""
}

func canvasTextFromResponses(raw []byte) (string, string) {
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return "", "OpenAI 未返回可用正文"
	}
	if data["error"] != nil || data["status"] == "failed" {
		return "", "OpenAI 返回错误响应"
	}
	if data["status"] == "incomplete" {
		return "", "OpenAI 输出不完整，请增加输出 token 上限"
	}
	if text, ok := data["output_text"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text), ""
	}
	var builder strings.Builder
	output, _ := data["output"].([]any)
	for _, item := range output {
		entry, _ := item.(map[string]any)
		parts, _ := entry["content"].([]any)
		for _, part := range parts {
			mapped, _ := part.(map[string]any)
			if mapped["type"] == "output_text" {
				if text, ok := mapped["text"].(string); ok {
					builder.WriteString(text)
				}
			}
		}
	}
	text := strings.TrimSpace(builder.String())
	if text == "" {
		return "", "OpenAI 未返回可用正文"
	}
	return text, ""
}
