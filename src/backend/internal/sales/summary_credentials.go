package sales

import (
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/system"
)

func summaryCredentials(cfg config.Config, r *http.Request, body summaryRequest) (base, key, model, message string) {
	model = strings.TrimSpace(body.Model)
	clientBase := strings.TrimSpace(body.CustomBaseURL)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	key = strings.TrimSpace(body.CustomAPIKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	defaults := strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL"))
	if defaults == "" {
		defaults = "https://ai.comfly.org"
	}
	base = defaults
	if clientBase != "" {
		if !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) && !(body.APIFormat == "openai-responses" && body.AllowInsecureHTTP && system.PublicHTTPGateway(clientBase)) {
			return "", "", "", "当前模型接口地址不可用，请检查渠道配置"
		}
		base = clientBase
	}
	base = gateway.NormalizeGatewayBaseURL(base)
	thirdParty := clientBase != "" && base != gateway.NormalizeGatewayBaseURL(defaults)
	if strings.HasPrefix(model, "deepseek-official:") {
		if model != "deepseek-official:deepseek-flash" {
			return "", "", "", "请选择支持图片的多模态模型"
		}
		if clientBase != "" && base != "https://api.deepseek.com" {
			return "", "", "", "DeepSeek 官方模型只能使用官方接口地址"
		}
		base, thirdParty = "https://api.deepseek.com", true
		model = strings.TrimPrefix(model, "deepseek-official:")
	}
	model = strings.TrimPrefix(model, "openai-responses:")
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	if key == "" {
		return "", "", "", "请先在设置中配置所选多模态模型的 API Key"
	}
	return base, key, model, ""
}
