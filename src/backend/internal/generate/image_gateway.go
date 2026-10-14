package generate

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

const lianchiImageBase = "https://api.gapnet.ai/endpoint"
const imageGatewayMismatch = "当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。"

func imageGatewayError(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model string) (int, map[string]any) {
	if model == "openai/gpt-image-2" {
		if imageHostIs(lianchiImageBase, "comfly.org") {
			return http.StatusBadRequest, map[string]any{"success": false, "error": "模型与接口不匹配：openai/gpt-image-2 不能使用 Comfly 地址", "code": "internal_error"}
		}
		if strings.TrimSpace(r.Header.Get("x-lianchi-api-key")) == "" {
			return http.StatusBadRequest, map[string]any{"success": false, "error": "未配置联池 API Key。请前往「设置 -> 服务接口配置 -> 联池」填写密钥。", "missingConfig": "apiKey"}
		}
		return 0, nil
	}
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	format := rawString(payload, "apiFormat")
	allowHTTP := rawBool(payload, "allowInsecureHttp")
	if clientBase != "" && !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) && !(format == "openai-responses" && allowHTTP && system.PublicHTTPGateway(clientBase)) {
		return http.StatusBadRequest, map[string]any{"success": false, "error": imageGatewayMismatch, "code": "gateway_base_url"}
	}
	base := imageDefaultBase()
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	if model == "gpt-image-2" && imageHostIs(base, "gapnet.ai") {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "模型与接口不匹配：gpt-image-2 请使用 Comfly，Gapnet 请使用 openai/gpt-image-2", "code": "internal_error"}
	}
	if imageAPIKey(cfg, r, payload, clientBase) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "未配置 AI 绘图接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入您的 Comfly API 凭证后使用。", "missingConfig": "apiKey"}
	}
	return 0, nil
}

func imageAPIKey(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, clientBase string) string {
	key := rawString(payload, "customApiKey")
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	defaults := imageDefaultBase()
	thirdParty := clientBase != "" && system.NormalizeGatewayBaseURL(clientBase) != system.NormalizeGatewayBaseURL(defaults)
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	return key
}

func imageDefaultBase() string {
	for _, key := range []string{"AI_DRAWING_BASE_URL", "AI_DRAWING_API_BASE_URL", "AI_API_BASE", "AI_BASE_URL"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return "https://ai.comfly.org"
}

func imageHostIs(base, root string) bool {
	parsed, err := url.Parse(base)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == root || strings.HasSuffix(host, "."+root)
}

func rawString(payload map[string]json.RawMessage, key string) string {
	var value string
	if json.Unmarshal(payload[key], &value) != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func rawBool(payload map[string]json.RawMessage, key string) bool {
	var value bool
	if json.Unmarshal(payload[key], &value) != nil {
		return false
	}
	return value
}
