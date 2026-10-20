package catalog

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/modelgw"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

var styleHTTP = func() *http.Client { return network.SafeClient() }

func extractStyle(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	var ok bool
	r, ok = generate.BindTextProtocol(w, r, payload)
	if !ok {
		return
	}
	images, _ := payload["imageUrls"].([]any)
	if len(images) == 0 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请至少提供 1 张参考风格图片"})
		return
	}
	base, key, model := styleCredentials(cfg, r, payload)
	if key == "" {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "系统尚未配置 AI 视觉接口密钥，请在顶部设置中填入"})
		return
	}
	if model == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请先在设置中配置多模态模型"})
		return
	}
	content := []any{map[string]any{"type": "text", "text": stylePrompt(styleString(payload, "userHint"), len(images))}}
	for _, image := range images {
		if text, ok := image.(string); ok && strings.TrimSpace(text) != "" {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": text}})
		}
	}
	text, status, usage, err := styleChat(r.Context(), base, key, model, content)
	if err != nil || status >= 300 || text == "" {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "风格架构提炼失败，请重试"})
		return
	}
	recipe := styleRecipe(text, images)
	body := map[string]any{"success": true, "recipe": recipe, "model": model}
	if usage != nil {
		body["usage"] = usage
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func styleCredentials(cfg config.Config, r *http.Request, payload map[string]any) (string, string, string) {
	model := strings.TrimSpace(styleString(payload, "model"))
	if model == "" {
		model = "gpt-5.6-luna"
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		return "https://api.deepseek.com", strings.TrimSpace(styleString(payload, "customApiKey")), strings.TrimPrefix(model, "deepseek-official:")
	}
	base := strings.TrimSpace(styleString(payload, "customBaseUrl"))
	if base == "" {
		base = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if base == "" {
		base = "https://ai.comfly.org"
	}
	key := strings.TrimSpace(styleString(payload, "customApiKey"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	if key == "" && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	return system.NormalizeGatewayBaseURL(base), key, model
}

func styleChat(ctx context.Context, base, key, model string, content []any) (string, int, map[string]any, error) {
	body := map[string]any{
		"model": model, "temperature": 0.4,
		"messages": []any{map[string]any{"role": "user", "content": content}},
	}
	if strings.HasPrefix(model, "deepseek-") {
		body["thinking"] = map[string]any{"type": "disabled"}
	}
	status, data, err := modelgw.CompleteText(ctx, modelgw.TextRequest{
		BaseURL: base, APIKey: key, Protocol: modelgw.TextProtocol(ctx, model), Payload: body,
		Client: styleHTTP(), Timeout: 90 * time.Second,
	})
	if err != nil {
		return "", status, nil, err
	}
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return "", status, nil, nil
	}
	choice, _ := choices[0].(map[string]any)
	message, _ := choice["message"].(map[string]any)
	text, _ := message["content"].(string)
	return strings.TrimSpace(text), status, generate.NormalizeUsage(data), nil
}

func stylePrompt(hint string, count int) string {
	return "你是顶级商业视觉导演。观察 " + itoaCatalog(count) + " 张参考图，提炼可复用的摄影提示词架构。用户补充：" + hint +
		"。只返回 JSON，字段 name、category、tag、desc、promptSnippet、architecture。promptSnippet 不少于 50 字。"
}

func styleRecipe(raw string, images []any) map[string]any {
	parsed := map[string]any{}
	clean := strings.TrimSpace(raw)
	if start := strings.Index(clean, "{"); start >= 0 {
		if end := strings.LastIndex(clean, "}"); end > start {
			_ = json.Unmarshal([]byte(clean[start:end+1]), &parsed)
		}
	}
	snippet := styleString(parsed, "promptSnippet")
	if len([]rune(snippet)) < 50 {
		snippet = "你是一位在社媒拥有百万粉丝的种草级商业摄影大师。\n\n【核心视觉置景架构规则】：\n- 【空间置景与材质】：根据图集风格还原真实空间层次与质感台面\n- 【采光系统与色温】：自然柔和光影\n- 【高颜值道具生态】：自然搭配生活道具\n- 【摄影参数与去AI】：35mm 手机后置主摄实拍"
	}
	sample, _ := json.Marshal(limitAny(images, 10))
	cover := ""
	if len(images) > 0 {
		cover, _ = images[0].(string)
	}
	return map[string]any{
		"name":         styleText(styleString(parsed, "name"), "自定义电商爆款风格架构"),
		"category":     styleText(styleString(parsed, "category"), "digital_3c"),
		"tag":          styleText(styleString(parsed, "tag"), "自然光影 · 动态架构"),
		"desc":         styleText(styleString(parsed, "desc"), "真实买家秀提示词生成元架构。"),
		"architecture": parsed["architecture"], "promptSnippet": snippet,
		"coverUrl": cover, "sampleImages": string(sample),
	}
}

func styleString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func styleText(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func limitAny(items []any, max int) []any {
	if len(items) <= max {
		return items
	}
	return items[:max]
}

func itoaCatalog(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
