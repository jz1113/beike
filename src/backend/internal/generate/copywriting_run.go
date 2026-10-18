package generate

import (
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func runCopywriting(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	model, _ := payload["model"].(string)
	if strings.TrimSpace(model) == "" {
		model = "gpt-5.6-luna"
	}
	base, key := copyCredentials(cfg, r, payload)
	prompt := copyUserPrompt(payload)
	messages := []any{
		map[string]any{"role": "system", "content": copySystemPrompt},
		map[string]any{"role": "user", "content": prompt},
	}
	text, data, status, err := ChatCompletionJSON(r.Context(), base, key, model, messages, 0.7, 18*time.Second)
	parsed := DecodeObject(text)
	if err != nil || status >= 300 || parsed == nil {
		if status == 404 {
			writeCopyFallback(w, payload)
			return
		}
		writeCopyFallback(w, payload)
		return
	}
	title, _ := parsed["title"].(string)
	content, _ := parsed["content"].(string)
	if title == "" || content == "" {
		writeCopyFallback(w, payload)
		return
	}
	fallback := localCopy(payload)
	tags := []any{"#小红书买家秀", "#好物分享", "#实测推荐"}
	if list, ok := parsed["tags"].([]any); ok && len(list) > 0 {
		tags = list
	}
	body := map[string]any{
		"success": true,
		"data": map[string]any{
			"title":   formatCleanTitle(title, sanitizeProductTitle(StringField(payload, "productTitle")), StringListField(payload, "existingTitles")),
			"content": formatCleanContent(content, StringField(fallback, "content")),
			"tags":    tags,
		},
		"model": model,
	}
	attachUsage(body, data)
	httpx.WriteJSON(w, http.StatusOK, body)
}

const copySystemPrompt = "你是一位拥有丰富真实自用经验的小红书生活买家秀博主。标题 5 到 20 个字且不含表情符号，正文大于 100 字并用双换行分段。只返回 JSON：{\"title\":\"\",\"content\":\"\",\"tags\":[]}。"

func copyUserPrompt(payload map[string]any) string {
	return "商品名称：" + StringField(payload, "productTitle") + "。品类：" + StringField(payload, "productCategory") + "。角色：" + StringField(payload, "productRole") + "。补充：" + StringField(payload, "extraRequirements") + "。输出纯 JSON。"
}

func copyCredentials(cfg config.Config, r *http.Request, payload map[string]any) (string, string) {
	model := strings.TrimSpace(StringField(payload, "model"))
	base := strings.TrimSpace(StringField(payload, "customBaseUrl"))
	if base == "" {
		base = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	key := strings.TrimSpace(StringField(payload, "customApiKey"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		return "https://api.deepseek.com", key
	}
	if base == "" {
		base = ImageDefaultBase()
	}
	return system.NormalizeGatewayBaseURL(base), key
}

func formatCleanContent(raw, fallback string) string {
	content := strings.TrimSpace(stripEmojis(raw))
	if Utf16Len(content) < 100 {
		content = strings.TrimSpace(fallback)
	}
	content = strings.ReplaceAll(content, "\r\n", "\n")
	for strings.Contains(content, "\n\n\n") {
		content = strings.ReplaceAll(content, "\n\n\n", "\n\n")
	}
	return strings.TrimSpace(content)
}
