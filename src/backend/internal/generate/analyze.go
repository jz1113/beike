package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"beike.local/cloud/src/backend/internal/system"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func Analyze(cfg config.Config) http.Handler {
	guarded := submission.GuardWithOptions(cfg.SQLiteFile(), "workshop-analyze", submission.GuardOptions{Timeout: 5 * time.Minute}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
			return
		}
		var ok bool
		r, ok = bindRawTextProtocol(w, r, payload)
		if !ok {
			return
		}
		if message := analyzeBodyError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": message})
			return
		}
		if status, fields := analyzeGatewayError(cfg, r, payload); status != 0 {
			httpx.WriteJSON(w, status, fields)
			return
		}
		runAnalyze(cfg, w, r, payload)
	}))
	return guarded
}

func analyzeBodyError(payload map[string]json.RawMessage) string {
	checks := []struct {
		key string
		max int
	}{
		{"mode", 64},
		{"productTitle", 500},
		{"model", 200},
		{"extraRequirements", 20_000},
		{"customBaseUrl", 2048},
		{"customApiKey", 4096},
	}
	if message := optionalAnalyzeString(payload, checks[0].key, checks[0].max); message != "" {
		return message
	}
	if message := optionalAnalyzeString(payload, checks[1].key, checks[1].max); message != "" {
		return message
	}
	if message := analyzeURLList(payload, "imageUrls"); message != "" {
		return message
	}
	if message := analyzeURLList(payload, "referenceImageUrls"); message != "" {
		return message
	}
	if message := optionalAnalyzeString(payload, "model", 200); message != "" {
		return message
	}
	if message := analyzeShotCount(payload["shotCount"]); message != "" {
		return message
	}
	for _, check := range checks[3:] {
		if message := optionalAnalyzeString(payload, check.key, check.max); message != "" {
			return message
		}
	}
	return ""
}

func optionalAnalyzeString(payload map[string]json.RawMessage, key string, max int) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if analyzeKind(raw) != "string" {
		return key + ": Expected string, received " + analyzeKind(raw)
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return key + ": Expected string, received string"
	}
	if Utf16Len(value) > max {
		return key + ": String must contain at most " + Itoa(max) + " character(s)"
	}
	return ""
}

func analyzeURLList(payload map[string]json.RawMessage, key string) string {
	raw, ok := payload[key]
	if !ok {
		return ""
	}
	if analyzeKind(raw) != "array" {
		return key + ": Expected array, received " + analyzeKind(raw)
	}
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil {
		return key + ": Expected array, received array"
	}
	if len(items) > 24 {
		return key + ": Array must contain at most 24 element(s)"
	}
	for index, item := range items {
		if analyzeKind(item) != "string" {
			return key + "." + Itoa(index) + ": Expected string, received " + analyzeKind(item)
		}
		var value string
		if json.Unmarshal(item, &value) != nil || Utf16Len(value) > 8192 {
			return key + "." + Itoa(index) + ": String must contain at most 8192 character(s)"
		}
	}
	return ""
}

func analyzeShotCount(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	if analyzeKind(raw) != "number" {
		return "shotCount: Expected number, received " + analyzeKind(raw)
	}
	var number float64
	if json.Unmarshal(raw, &number) != nil {
		return "shotCount: Number must be finite"
	}
	if number != float64(int(number)) {
		return "shotCount: Expected integer, received float"
	}
	if number < 1 {
		return "shotCount: Number must be greater than or equal to 1"
	}
	if number > 24 {
		return "shotCount: Number must be less than or equal to 24"
	}
	return ""
}

func analyzeKind(raw json.RawMessage) string {
	text := strings.TrimSpace(string(raw))
	switch {
	case text == "" || text == "null":
		return "null"
	case text == "true" || text == "false":
		return "boolean"
	case strings.HasPrefix(text, "\""):
		return "string"
	case strings.HasPrefix(text, "["):
		return "array"
	case strings.HasPrefix(text, "{"):
		return "object"
	default:
		return "number"
	}
}

func analyzeGatewayError(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (int, map[string]any) {
	model := rawString(payload, "model")
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		id := strings.TrimPrefix(model, "deepseek-official:")
		if id != "deepseek-flash" && id != "deepseek-v4-pro" {
			return http.StatusBadRequest, map[string]any{"success": false, "error": "此 DeepSeek 官方模型尚未适配", "code": "gateway_base_url"}
		}
		if clientBase != "" && gateway.NormalizeGatewayBaseURL(clientBase) != "https://api.deepseek.com" {
			return http.StatusBadRequest, map[string]any{"success": false, "error": "DeepSeek 官方模型只能使用官方接口地址", "code": "gateway_base_url"}
		}
		if rawString(payload, "customApiKey") == "" {
			return analyzeMissingKey()
		}
		return 0, nil
	}
	format := rawString(payload, "apiFormat")
	allowHTTP := rawBool(payload, "allowInsecureHttp")
	if clientBase != "" && !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) && !(format == "openai-responses" && allowHTTP && system.PublicHTTPGateway(clientBase)) {
		return http.StatusBadRequest, map[string]any{"success": false, "error": ImageGatewayMismatch, "code": "gateway_base_url"}
	}
	if imageAPIKey(cfg, r, payload, clientBase) == "" {
		return analyzeMissingKey()
	}
	return 0, nil
}

func analyzeMissingKey() (int, map[string]any) {
	return http.StatusBadRequest, map[string]any{
		"error":         "未配置 AI 视觉大模型接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入您的 Comfly API 凭证。",
		"missingConfig": "apiKey",
	}
}

func runAnalyze(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	model := rawString(payload, "model")
	if model == "" {
		model = "gpt-6-luna"
	}
	base, apiKey := imageSubmitCredentials(cfg, r, payload, model)
	shotCount := int(rawNumber(payload, "shotCount"))
	if shotCount == 0 {
		shotCount = 4
	}
	title := rawString(payload, "productTitle")
	binding, bindingErr := loadWorkshopBinding(cfg, r, payload)
	if bindingErr != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": bindingErr.Error()})
		return
	}
	content := workshopAnalyzeContent(cfg, payload, binding, shotCount)
	messages := []any{map[string]any{"role": "user", "content": content}}
	text, data, status, err := gateway.ChatCompletionJSON(r.Context(), base, apiKey, model, messages, 0.4, 240*time.Second)
	if err != nil || status >= 300 || text == "" {
		message := "视觉分析失败"
		if err != nil {
			message = err.Error()
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": message})
		return
	}
	parsed := gateway.DecodeObject(text)
	if parsed == nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "视觉模型没有返回合法 JSON"})
		return
	}
	prompts, promptErr := finalizeWorkshopPrompts(parsed, binding, shotCount)
	if promptErr != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"error": promptErr.Error()})
		return
	}
	fingerprint := workshopFingerprint(parsed)
	role := TextField(parsed, "productRole", "product_role")
	scene := TextField(parsed, "masterScene", "master_scene")
	look := TextField(parsed, "lookBible", "look_bible")
	style := TextField(parsed, "styleBible", "style_bible")
	identity := TextField(parsed, "identityBible", "identity_bible")
	action := TextField(parsed, "actionDigest")
	saveAnalysis(cfg, r, rawString(payload, "productId"), title, fingerprint, model, prompts, binding)
	var group any
	if scene != "" {
		group = map[string]any{"scene": scene, "actionDigest": action}
	}
	body := map[string]any{
		"success":             true,
		"product_fingerprint": fingerprint, "productFingerprint": fingerprint,
		"product_role": role, "productRole": role,
		"master_scene": scene, "masterScene": scene,
		"look_bible": look, "lookBible": look,
		"look_parts": parsed["lookParts"], "lookParts": parsed["lookParts"],
		"style_bible": style, "styleBible": style,
		"identity_bible": identity, "identityBible": identity,
		"actionDigest": action, "groupSignature": group,
		"prompts": prompts, "modelUsed": model, "requestedModel": model,
		"modelSwitched": false, "triedModels": []string{model}, "rawOutput": text,
		"usedActionIds": []any{}, "assetTrace": workshopTrace(binding),
		"qualityChecks": []any{}, "usedAssetLibrary": false, "assemblySource": "skill",
	}
	attachUsage(body, data)
	httpx.WriteJSON(w, http.StatusOK, body)
}

func TextField(data map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := data[key].(string); ok {
			return text
		}
	}
	return ""
}

// Models sometimes return the visible features grouped by part rather than as
// one sentence. Keep those observations when passing the plan to image generation.
func workshopFingerprint(parsed map[string]any) string {
	if value := TextField(parsed, "productFingerprint", "product_fingerprint"); value != "" {
		return value
	}
	for _, key := range []string{"productFingerprint", "product_fingerprint"} {
		switch value := parsed[key].(type) {
		case map[string]any, []any:
			if raw, err := json.Marshal(value); err == nil && len(raw) > 2 && len(raw) <= 8192 {
				return string(raw)
			}
		}
	}
	return ""
}

func saveAnalysis(cfg config.Config, r *http.Request, productID, title, fingerprint, model string, prompts []any, binding *workshopBinding) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	raw, _ := json.Marshal(prompts)
	if title == "" {
		title = "未命名商品"
	}
	input := dbcatalog.PromptDraft{ProductTitle: title, Fingerprint: fingerprint, ModelUsed: model, StyleName: "技能创作", PromptsJSON: string(raw)}
	if productID != "" {
		input.ProductID = productID
	}
	if binding != nil {
		input.StyleName = TextField(binding.Skill, "name")
		if version := TextField(binding.Skill, "libraryVersion"); version != "" {
			input.StyleName += " · " + version
		}
	}
	_, _ = dbcatalog.CreatePromptRecord(r.Context(), db, workspaceOf(r), input)
}
