package generate

import (
	"encoding/json"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

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
		if clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != "https://api.deepseek.com" {
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
