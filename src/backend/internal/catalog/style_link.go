package catalog

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

var socialBodyFields = []string{
	"url", "text", "link", "query", "scraperId", "customScraperId", "scraperSecret", "customApiKey",
	"qiyunAppId", "qiyunAppKey", "customQiyunAppId", "customQiyunAppKey", "preferredScraper",
}

func parseLinkHandler(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		var payload any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		if message := socialLinkBodyError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		status, response := parseSocialLink(cfg, r, payload.(map[string]any))
		httpx.WriteJSON(w, status, response)
	})
}

func socialLinkBodyError(value any) string {
	input, ok := value.(map[string]any)
	if !ok {
		return "请求体必须为 JSON 对象"
	}
	for _, key := range socialBodyFields {
		field, exists := input[key]
		if !exists {
			continue
		}
		text, isString := field.(string)
		if !isString || jsLength(text) > 8192 {
			return "链接、解析配置必须为有效文本（最多 8192 字符）"
		}
	}
	return ""
}

func extractStyleHandler(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		var payload any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		input, ok := payload.(map[string]any)
		if !ok {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为 JSON 对象"})
			return
		}
		if message := deepseekStyleError(r, input); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "code": "gateway_base_url"})
			return
		}
		extractStyle(cfg, w, r, input)
	})
}

func deepseekStyleError(r *http.Request, payload map[string]any) string {
	model, _ := payload["model"].(string)
	model = strings.TrimSpace(model)
	if !strings.HasPrefix(model, "deepseek-official:") {
		return ""
	}
	id := strings.TrimPrefix(model, "deepseek-official:")
	if id != "deepseek-flash" && id != "deepseek-v4-pro" {
		return "此 DeepSeek 官方模型尚未适配"
	}
	base, _ := payload["customBaseUrl"].(string)
	base = strings.TrimSpace(base)
	if base == "" {
		base = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if base != "" && system.NormalizeGatewayBaseURL(base) != "https://api.deepseek.com" {
		return "DeepSeek 官方模型只能使用官方接口地址"
	}
	return ""
}

func jsLength(value string) int {
	count := 0
	for _, r := range value {
		if r > 0xFFFF {
			count += 2
			continue
		}
		count++
	}
	return count
}
