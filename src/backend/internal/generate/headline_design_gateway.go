package generate

import (
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

func HeadlineAccessError(cfg config.Config, r *http.Request, payload map[string]any, missingKey string) string {
	model, _ := payload["model"].(string)
	model = strings.TrimSpace(model)
	clientBase, _ := payload["customBaseUrl"].(string)
	clientBase = strings.TrimSpace(clientBase)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if strings.HasPrefix(model, "deepseek-official:") {
		id := strings.TrimPrefix(model, "deepseek-official:")
		if id != "deepseek-flash" && id != "deepseek-v4-pro" {
			return "此 DeepSeek 官方模型尚未适配"
		}
		if clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != "https://api.deepseek.com" {
			return "DeepSeek 官方模型只能使用官方接口地址"
		}
		if strings.TrimSpace(StringField(payload, "customApiKey")) == "" {
			return missingKey
		}
		return ""
	}
	if clientBase != "" && !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) {
		return ImageGatewayMismatch
	}
	if HeadlineAPIKey(cfg, r, payload, clientBase) == "" {
		return missingKey
	}
	return ""
}

func HeadlineAPIKey(cfg config.Config, r *http.Request, payload map[string]any, clientBase string) string {
	key := strings.TrimSpace(StringField(payload, "customApiKey"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	defaults := ImageDefaultBase()
	thirdParty := clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != system.NormalizeGatewayBaseURL(defaults)
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	return key
}
