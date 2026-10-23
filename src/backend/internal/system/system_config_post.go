package system

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func systemConfigPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "请求数据格式异常", "latencyMs": 0})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil || payload == nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "请求数据格式异常", "latencyMs": 0})
			return
		}
		kind, _ := payload["type"].(string)
		if kind == "" {
			kind = "ai"
		}
		client := network.SafeClient()
		switch kind {
		case "qiyun":
			serveQiyunProbe(w, r, cfg, payload, client)
		case "external_scraper":
			serveScraperProbe(w, r, cfg, payload, client)
		case "wanbang":
			serveWanbangProbe(w, r, payload, client)
		default:
			serveModelProbe(w, r, cfg, payload, client)
		}
	}
}

func serveQiyunProbe(w http.ResponseWriter, r *http.Request, cfg config.Config, payload map[string]any, client *http.Client) {
	appID := configText(payload, "qiyunAppId", cfg, "QIYUN_APP_ID")
	appKey := configText(payload, "qiyunAppKey", cfg, "QIYUN_APP_KEY")
	if appID == "" || appKey == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请先在输入框中填入奇云 AppId 与 AppKey 后再测试"})
		return
	}
	testURL := "https://v.douyin.com/iLrqc12/"
	if text, ok := payload["testUrl"].(string); ok && strings.TrimSpace(text) != "" {
		testURL = strings.TrimSpace(text)
	}
	ok, message, code := probeQiyun(r.Context(), client, "https://qyapi.ipaybuy.cn/api/video", appID, appKey, testURL)
	if !ok {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "latencyMs": 0, "upstreamCode": code})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "type": "qiyun", "latencyMs": 0, "message": message, "upstreamCode": code})
}

func serveScraperProbe(w http.ResponseWriter, r *http.Request, cfg config.Config, payload map[string]any, client *http.Client) {
	clientID := configText(payload, "externalScraperId", cfg, "EXTERNAL_SCRAPER_ID")
	secret := configText(payload, "externalScraperSecret", cfg, "EXTERNAL_SCRAPER_SECRET")
	if clientID == "" || secret == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请先在输入框中填入社媒解析 ID 与 API Secret 后再测试"})
		return
	}
	testURL := "https://www.xiaohongshu.com/explore/661234567890abcdef123456"
	if text, ok := payload["testUrl"].(string); ok && strings.TrimSpace(text) != "" {
		testURL = strings.TrimSpace(text)
	}
	authOK, parseOK, code, message := probeApia(r.Context(), client, "https://apia.vip/api/dsp", clientID, secret, testURL)
	if !authOK {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "latencyMs": 0, "upstreamCode": code, "authOk": false, "parseOk": false})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "type": "external_scraper", "latencyMs": 0, "authOk": authOK, "parseOk": parseOK, "upstreamCode": code, "message": message})
}

func serveWanbangProbe(w http.ResponseWriter, r *http.Request, payload map[string]any, client *http.Client) {
	key := strings.TrimSpace(headerOrBody(payload, "wanbangKey", r.Header.Get("x-wanbang-key")))
	secret := strings.TrimSpace(headerOrBody(payload, "wanbangSecret", r.Header.Get("x-wanbang-secret")))
	if key == "" || secret == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请先在输入框中填入万邦 API Key 与 API Secret 后再测试"})
		return
	}
	ok, quota, message := probeWanbang(r.Context(), client, key, secret, []string{
		"https://api-gw.onebound.cn/taobao/item_get/?num_iid=520813250866&cache=yes&is_promotion=1",
		"https://api-gw.onebound.cn/jd/item_get_pro/?num_iid=10057467958584&cache=yes&watermark=1",
	})
	if !ok {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message, "latencyMs": 0})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "type": "wanbang", "latencyMs": 0, "quotaInfo": quota, "message": "万邦电商采集接口连通正常！响应延迟 0ms" + quota})
}

func serveModelProbe(w http.ResponseWriter, r *http.Request, cfg config.Config, payload map[string]any, client *http.Client) {
	apiKey := configText(payload, "apiKey", cfg, "AI_DRAWING_API_KEY")
	if apiKey == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少 AI API Key"})
		return
	}
	baseURL := "https://ai.comfly.org"
	if text, ok := payload["baseUrl"].(string); ok && strings.TrimSpace(text) != "" {
		baseURL = strings.TrimSpace(text)
	} else if !cfg.Production() && strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL")) != "" {
		baseURL = strings.TrimSpace(os.Getenv("AI_DRAWING_BASE_URL"))
	}
	baseURL = normalizeGatewayBaseURL(baseURL)
	model := "gpt-5.6-luna"
	if text, ok := payload["model"].(string); ok && text != "" {
		model = text
	}
	protocol, valid := requestTextProtocol(payload)
	if !valid {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "textProtocol: 不支持的文本协议"})
		return
	}
	r = r.WithContext(gateway.WithTextProtocol(r.Context(), protocol))
	var status int
	var body map[string]any
	if mediaModel(model) {
		status, body = probeMediaCatalog(r.Context(), client, baseURL, apiKey, model)
	} else {
		status, body = probeChat(r.Context(), client, baseURL, apiKey, model)
	}
	body["latencyMs"] = 0
	httpx.WriteJSON(w, status, body)
}

func configText(payload map[string]any, field string, cfg config.Config, envKey string) string {
	if value, ok := payload[field]; ok {
		text, _ := value.(string)
		return strings.TrimSpace(text)
	}
	if cfg.Production() {
		return ""
	}
	return strings.TrimSpace(os.Getenv(envKey))
}

func headerOrBody(payload map[string]any, field, header string) string {
	if value, ok := payload[field].(string); ok {
		return value
	}
	return header
}

func mediaModel(id string) bool {
	switch id {
	case "gpt-image-2.5-flare", "openai/gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2", "nano-banana-pro", "nano-banana",
		"doubao-seedream-4-0-250828", "doubao-seedream-4-5-251128", "doubao-seedream-5-0-260128", "seedream-v5-pro",
		"qwen-image-max", "z-image-turbo", "qwen-image", "qwen-image-edit", "midjourney", "flux", "flux-pro-max",
		"grok-4.1-image", "grok-4.2-image", "grok-imagine-image-quality",
		"veo3.1", "veo3.1-fast", "omni_flash-10s", "kling-video-v3", "kling-video-v3-omni", "kling-video-v2-5-turbo", "kling-video-v2-6",
		"doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128", "doubao-seedance-2.0-mini", "doubao-seedance-2.5",
		"sora-2", "sora-2-pro", "MiniMax-H3", "wan3.0-video", "grok-imagine-video-1.5", "viduq3", "viduq3-mix", "viduq3-turbo", "viduq3-pro", "viduq4-preview", "gpt-6-astra":
		return true
	default:
		return false
	}
}
