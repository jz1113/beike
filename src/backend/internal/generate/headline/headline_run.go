package headline

import (
	"beike.local/cloud/src/backend/internal/generate"
	"net/http"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func runHeadlineTitle(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	model := strings.TrimSpace(generate.StringField(payload, "model"))
	if model == "" {
		model = "gemini-3.7-flash"
	}
	base, key := headlineCredentials(cfg, r, payload, model)
	images, message := headlineImages(r, generate.StringListField(payload, "imageUrls"))
	if message != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品图片读取失败，未调用标题模型"})
		return
	}
	content := []any{map[string]any{"type": "text", "text": headlineTitlePrompt(generate.StringField(payload, "originalTitle"), generate.StringField(payload, "productName"))}}
	for _, image := range images {
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
	}
	text, usageData, status, err := generate.ChatCompletionJSON(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.35, 90*time.Second)
	if err != nil || status >= 300 {
		httpx.WriteJSON(w, headlineFailure(err, status), map[string]any{"success": false, "error": headlineErrorText(err, status, "标题改写模型 "+model+" 返回 HTTP "+generate.Itoa(status))})
		return
	}
	parsed := generate.DecodeObject(text)
	title := ""
	if parsed != nil {
		title, _ = parsed["title"].(string)
	}
	title = normalizeHeadline(title)
	if !regexp.MustCompile(`^[\x{3400}-\x{9fff}]{7,12}$`).MatchString(title) {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "标题改写模型未返回 7–12 字的有效主标题，未截断或提交后续任务"})
		return
	}
	body := map[string]any{"success": true, "data": map[string]any{"title": title}, "model": model}
	if usage := generate.NormalizeUsage(usageData); usage != nil {
		body["usage"] = usage
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func runHeadlineDesign(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	model := strings.TrimSpace(generate.StringField(payload, "model"))
	if model == "" {
		model = "gemini-3.7-flash"
	}
	original := strings.TrimSpace(generate.StringField(payload, "originalTitle"))
	if original == "" {
		original = strings.TrimSpace(generate.StringField(payload, "productTitle"))
	}
	cover := strings.TrimSpace(generate.StringField(payload, "coverTitle"))
	if cover == "" {
		cover = strings.TrimSpace(generate.StringField(payload, "productTitle"))
	}
	base, key := headlineCredentials(cfg, r, payload, model)
	images, message := headlineImages(r, generate.StringListField(payload, "imageUrls"))
	if message != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "商品图片读取失败，未调用设计或生图模型"})
		return
	}
	ratio := generate.StringField(payload, "aspectRatio")
	if ratio != "1:1" {
		ratio = "3:4"
	}
	stylePrompt := strings.TrimSpace(generate.StringField(payload, "stylePrompt"))
	negativeRules := generate.StringListField(payload, "negativeRules")
	content := []any{map[string]any{"type": "text", "text": coverDirectorPromptWithStyle(original, cover, ratio, generate.StringField(payload, "productName"), stylePrompt, negativeRules)}}
	for _, image := range images {
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image}})
	}
	text, usageData, status, err := generate.ChatCompletionJSON(r.Context(), base, key, model, []any{map[string]any{"role": "user", "content": content}}, 0.65, 90*time.Second)
	if err != nil || status >= 300 || strings.TrimSpace(text) == "" {
		code := headlineFailure(err, status)
		if strings.TrimSpace(text) == "" && err == nil && status < 300 {
			code = http.StatusBadGateway
		}
		httpx.WriteJSON(w, code, map[string]any{"success": false, "error": headlineErrorText(err, status, "设计模型 "+model+" 没有返回有效内容")})
		return
	}
	parsed := generate.DecodeObject(text)
	if parsed == nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "设计模型没有返回合法 JSON"})
		return
	}
	design, message := validateCoverDesign(parsed, cover, artDirectionID(payload), generate.StringField(payload, "productName"))
	if message != "" {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": message})
		return
	}
	body := map[string]any{"success": true, "data": design, "model": model, "promptVersion": "integrated-cover-v4"}
	if usage := generate.NormalizeUsage(usageData); usage != nil {
		body["usage"] = usage
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func headlineCredentials(cfg config.Config, r *http.Request, payload map[string]any, model string) (string, string) {
	if strings.HasPrefix(model, "deepseek-official:") {
		return "https://api.deepseek.com", strings.TrimSpace(generate.StringField(payload, "customApiKey"))
	}
	clientBase := strings.TrimSpace(generate.StringField(payload, "customBaseUrl"))
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := generate.ImageDefaultBase()
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	return base, generate.HeadlineAPIKey(cfg, r, payload, clientBase)
}

func headlineImages(r *http.Request, urls []string) ([]string, string) {
	out := make([]string, 0, len(urls))
	for _, item := range urls {
		item = strings.TrimSpace(item)
		if strings.HasPrefix(item, "data:image/") {
			out = append(out, item)
			continue
		}
		status, raw, err := generate.PostModel(r.Context(), http.MethodGet, item, "", nil, 20*time.Second)
		if err != nil || status < 200 || status >= 300 || len(raw) == 0 {
			return nil, "unread"
		}
		out = append(out, item)
	}
	return out, ""
}

func headlineTitlePrompt(original, product string) string {
	return "你是中文短视频封面的标题编辑。只返回 JSON：{\"title\":\"7-12个纯中文字符\"}。原标题：" + original + "。商品名：" + product + "。标题必须是 7 到 12 个纯中文字符，保留可验证结论，不要套话。"
}

func coverDirectorPromptWithStyle(original, cover, ratio, product, stylePrompt string, negativeRules []string) string {
	base := "你是中文短视频封面美术指导。画布比例 " + ratio + "。原标题：" + original + "。封面标题：" + cover + "。商品名：" + product + "。"
	if strings.TrimSpace(stylePrompt) != "" {
		base += "【核心风格指定】" + strings.TrimSpace(stylePrompt) + "。"
	}
	if len(negativeRules) > 0 {
		base += "【负向严格避坑约束】" + strings.Join(negativeRules, "；") + "。"
	}
	base += "只返回 JSON，字段 title、titleLines、productNameLine、composition、material、palette、artDirectionId、typographySystem、typography、visualAnchor、styleFamily、imagePrompt。titleLines 拼接必须等于封面标题。imagePrompt 为 450 到 1000 字，并用「」逐行列出标题。"
	return base
}

func normalizeHeadline(value string) string {
	replacer := strings.NewReplacer("“", "", "”", "", "'", "", "‘", "", "’", "", "【", "", "】", "", "[", "", "]", "", "（", "", "）", "", "(", "", ")", "", "，", "", "。", "", "！", "", "？", "", "、", "", "；", "", "：", "", " ", "", "\n", "", "\t", "")
	return strings.TrimSpace(replacer.Replace(value))
}

func headlineFailure(err error, status int) int {
	if status == 0 {
		return http.StatusBadGateway
	}
	if status >= 500 {
		return http.StatusBadGateway
	}
	if err != nil && status >= 400 {
		return http.StatusBadGateway
	}
	return http.StatusInternalServerError
}

func headlineErrorText(err error, status int, fallback string) string {
	if err != nil && err.Error() != "" && status >= 200 {
		return fallback
	}
	if status >= 400 {
		return fallback
	}
	if err != nil {
		return fallback
	}
	return fallback
}

func artDirectionID(payload map[string]any) string {
	raw, _ := payload["reservedArtDirection"].(map[string]any)
	id, _ := raw["id"].(string)
	return strings.TrimSpace(id)
}
