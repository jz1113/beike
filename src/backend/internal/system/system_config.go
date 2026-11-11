package system

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func Pricing() http.Handler { return pricingHandler() }
func DepthEnv(cfg config.Config) http.Handler {
	return depthEnvHandler(cfg)
}
func ConfigGet(cfg config.Config) http.Handler  { return systemConfigHandler(cfg) }
func ConfigPost(cfg config.Config) http.Handler { return systemConfigPostHandler(cfg) }
func GatewayUser() http.Handler                 { return gatewayUserHandler() }
func ModelFetch(cfg config.Config) http.Handler { return modelFetchHandler(cfg) }
func MemoryCleanup(cfg config.Config) http.Handler {
	return memoryCleanupHandler(cfg)
}
func MediaReview(cfg config.Config) http.Handler { return mediaReviewHandler(cfg) }

type CatalogModel = catalogModel

func AllowCustomBase(cfg config.Config) bool { return allowCustomBase(cfg) }
func SafeHTTPSGateway(raw string) bool       { return safeHTTPSGateway(raw) }
func PublicHTTPGateway(raw string) bool      { return publicHTTPGateway(raw) }
func GatewayGET(ctx context.Context, client *http.Client, rawURL, token, userID string) (map[string]any, int, error) {
	return gatewayGET(ctx, client, rawURL, token, userID)
}

func envOr(key, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback
	}
	return value
}

type systemModelLists struct {
	VisionModels []json.RawMessage `json:"visionModels"`
	ImageModels  []json.RawMessage `json:"imageModels"`
}

var systemModelCache struct {
	sync.Mutex
	root  string
	lists systemModelLists
}

func loadSystemModels(root string) (systemModelLists, error) {
	systemModelCache.Lock()
	defer systemModelCache.Unlock()
	if systemModelCache.root == root && systemModelCache.lists.VisionModels != nil {
		return systemModelCache.lists, nil
	}
	raw, err := os.ReadFile(filepath.Join(root, "src/shared/data/systemConfigModels.json"))
	if err != nil {
		return systemModelLists{}, err
	}
	var lists systemModelLists
	if err := json.Unmarshal(raw, &lists); err != nil {
		return systemModelLists{}, err
	}
	systemModelCache.root = root
	systemModelCache.lists = lists
	return lists, nil
}

func systemConfigHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		lists, err := loadSystemModels(cfg.Root)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		expose := !cfg.Production()
		baseURL := envOr("AI_DRAWING_BASE_URL", "https://ai.comfly.org")
		normalized := gateway.NormalizeGatewayBaseURL(baseURL)
		if normalized == "" {
			normalized = baseURL
		}
		apiKey, wanbangKey, wanbangSecret := "", "", ""
		scraperID, scraperSecret, qiyunID, qiyunKey := "", "", "", ""
		if expose {
			apiKey = envOr("AI_DRAWING_API_KEY", "")
			wanbangKey = envOr("WANBANG_API_KEY", "")
			wanbangSecret = envOr("WANBANG_API_SECRET", "")
			scraperID = envOr("EXTERNAL_SCRAPER_ID", "")
			scraperSecret = envOr("EXTERNAL_SCRAPER_SECRET", "")
			qiyunID = envOr("QIYUN_APP_ID", "")
			qiyunKey = envOr("QIYUN_APP_KEY", "")
		}
		masked := "未配置"
		if apiKey != "" {
			masked = "已配置"
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"config": map[string]any{
				"baseUrl": baseURL, "normalizedBaseUrl": normalized,
				"hasApiKey": apiKey != "", "maskedKey": masked,
				"hasWanbangKey": wanbangKey != "", "wanbangSecretConfigured": wanbangSecret != "",
				"wanbangHost":                     "https://api-gw.onebound.cn",
				"hasExternalScraper":              scraperID != "" && scraperSecret != "",
				"externalScraperSecretConfigured": scraperSecret != "",
				"externalScraperHost":             "https://apia.vip/api/dsp/",
				"hasQiyun":                        qiyunID != "" && qiyunKey != "",
				"qiyunAppKeyConfigured":           qiyunKey != "",
				"qiyunHost":                       "https://qyapi.ipaybuy.cn/api/video",
				"defaultVisionModel":              "gpt-6-luna",
				"defaultImageModel":               "gpt-image-2",
				"visionModels":                    lists.VisionModels,
				"imageModels":                     lists.ImageModels,
				"fallbackChain":                   []any{},
			},
		})
	}
}

func systemConfigPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		const maxBody = 1 << 20
		body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
		if err != nil || len(body) > maxBody {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常", "latencyMs": 0})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil || payload == nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常", "latencyMs": 0})
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
	baseURL = gateway.NormalizeGatewayBaseURL(baseURL)
	model := "gpt-6-luna"
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
	if mediaModel(cfg.Root, model) {
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

func mediaModel(root, id string) bool {
	if model, ok := selectableCatalogModel(root, id); ok && (model.IsImage || model.IsVideo) {
		return true
	}
	if gateway.IsApprovedImage(id) || gateway.IsApprovedVideo(id) {
		return true
	}
	switch id {
	case "qwen-image-max", "qwen-image", "qwen-image-edit":
		return true
	default:
		return false
	}
}

func probeWanbang(ctx context.Context, client *http.Client, key, secret string, endpoints []string) (bool, string, string) {
	last := ""
	for _, endpoint := range endpoints {
		parsed, err := url.Parse(endpoint)
		if err != nil {
			last = "万邦网关请求失败"
			continue
		}
		query := parsed.Query()
		query.Set("key", key)
		query.Set("secret", secret)
		parsed.RawQuery = query.Encode()
		data, status, err := getJSON(ctx, client, parsed.String())
		if err != nil || status < 200 || status >= 300 {
			if status > 0 {
				last = "万邦网关请求失败（HTTP " + strconv.Itoa(status) + "）"
			} else {
				last = "万邦网关请求失败"
			}
			continue
		}
		code := stringifyConfig(data["error_code"])
		if code == "4005" || code == "1001" || code == "4001" {
			return false, "", "万邦接口鉴权失败 [" + code + "]: " + configReason(data, "请检查 Key 与 Secret")
		}
		if code != "" && code != "0000" {
			last = "万邦接口返回异常 [" + code + "]: " + configReason(data, "未知错误")
			continue
		}
		return true, wanbangQuota(stringifyConfig(data["api_info"])), ""
	}
	if last == "" {
		last = "万邦网关响应异常，请检查 Key 与 Secret"
	}
	return false, "", last
}

func wanbangQuota(info string) string {
	today := regexp.MustCompile(`today:(\d+)`).FindStringSubmatch(info)
	max := regexp.MustCompile(`max:(\d+)`).FindStringSubmatch(info)
	expires := regexp.MustCompile(`expires:([\d-]+)`).FindStringSubmatch(info)
	if len(max) < 2 {
		return ""
	}
	todayCount := "0"
	if len(today) == 2 {
		todayCount = today[1]
	}
	quota := " (今日调用: " + todayCount + " / 每日上限: " + max[1]
	if len(expires) == 2 {
		quota += " / 到期日: " + expires[1]
	}
	return quota + ")"
}

func probeMediaCatalog(ctx context.Context, client *http.Client, baseURL, apiKey, model string) (int, map[string]any) {
	data, status, err := authorizedJSON(ctx, client, http.MethodGet, gateway.ModelsURL(baseURL), apiKey, nil)
	if err != nil || status < 200 || status >= 300 {
		code := status
		if code == 0 {
			code = http.StatusBadGateway
		}
		return http.StatusBadRequest, map[string]any{"success": false, "status": code, "error": "模型目录请求失败（HTTP " + strconv.Itoa(code) + "），请检查网关地址、凭证或额度。", "testedGeneration": false}
	}
	list, _ := data["data"].([]any)
	if list == nil {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "网关未返回有效的模型目录，无法确认模型是否可见。", "testedGeneration": false}
	}
	visible := false
	for _, item := range list {
		object, _ := item.(map[string]any)
		if stringifyConfig(object["id"]) == model {
			visible = true
		}
	}
	message := "网关连接正常，但目录中未找到该模型；生成权限和可用性尚未确认。"
	if visible {
		message = "网关连接正常，模型在目录中可见；未执行图片或视频生成。"
	}
	return http.StatusOK, map[string]any{"success": true, "model": model, "modelVisible": visible, "testedGeneration": false, "message": message}
}

func probeChat(ctx context.Context, client *http.Client, baseURL, apiKey, model string) (int, map[string]any) {
	if protocol := gateway.TextProtocol(ctx, model); protocol != "openai" {
		status, _, err := gateway.CompleteText(ctx, gateway.TextRequest{
			BaseURL: baseURL, APIKey: apiKey, Protocol: protocol, Client: client, Timeout: 40 * time.Second,
			Payload: map[string]any{"model": model, "max_tokens": 4096, "reasoning_effort": "low", "messages": []map[string]string{{"role": "user", "content": "Ping. Reply PONG only."}}},
		})
		if err != nil {
			return http.StatusBadRequest, map[string]any{"success": false, "status": status, "error": err.Error(), "textProtocol": protocol}
		}
		return http.StatusOK, map[string]any{"success": true, "model": model, "textProtocol": protocol, "testedGeneration": true}
	}
	payload, _ := json.Marshal(map[string]any{
		"model": model, "max_tokens": 10,
		"messages": []map[string]string{{"role": "user", "content": "Ping. Reply \"PONG\" only."}},
	})
	_, status, err := authorizedJSON(ctx, client, http.MethodPost, gateway.ChatCompletionsURL(baseURL), apiKey, payload)
	if err != nil || status < 200 || status >= 300 {
		return http.StatusBadRequest, map[string]any{"success": false, "status": status, "error": "接口响应异常"}
	}
	return http.StatusOK, map[string]any{"success": true, "model": model}
}

func probeQiyun(ctx context.Context, client *http.Client, endpoint, appID, appKey, testURL string) (bool, string, any) {
	body, _ := json.Marshal(map[string]string{"appId": appID, "appKey": appKey, "url": testURL})
	data, status, err := postJSON(ctx, client, endpoint, body)
	if err != nil {
		return false, "连接奇云网关失败", nil
	}
	if status < 200 || status >= 300 {
		return false, "奇云网关返回 HTTP " + strconv.Itoa(status), status
	}
	code := stringifyConfig(data["code"])
	if code == "200" {
		title := ""
		if item, ok := data["data"].(map[string]any); ok {
			title = stringifyConfig(item["title"])
		}
		if title == "" {
			title = "作品"
		}
		runes := []rune(title)
		if len(runes) > 20 {
			title = string(runes[:20])
		}
		return true, "奇云接口测试通过！已成功提取《" + title + "》", nil
	}
	if code == "204" || code == "500" {
		return true, "奇云 AppId/AppKey 凭证校验通过（测试样本返回状态码: " + code + "）", code
	}
	return false, "短视频或图集解析异常", code
}

func probeApia(ctx context.Context, client *http.Client, base, clientID, secret, testURL string) (bool, bool, any, string) {
	endpoint := strings.TrimRight(base, "/") + "/" + url.PathEscape(secret) + "/" + url.PathEscape(clientID) + "/"
	data, _, err := getJSON(ctx, client, endpoint+"?url="+url.QueryEscape(testURL))
	if err != nil || data == nil {
		payload, _ := json.Marshal(map[string]string{"url": testURL})
		data, _, err = postJSON(ctx, client, endpoint, payload)
	}
	if err != nil || data == nil {
		return false, false, nil, "连接 APIA 解析网关失败"
	}
	code := stringifyConfig(data["code"])
	authOK := code == "103" || code == "104" || code == "110" || code == "113" || code == "114"
	if code == "200" || code == "0" || code == "" && data["data"] != nil {
		return true, true, code, "APIA 密钥有效且小红书解析成功"
	}
	if authOK {
		return true, false, code, "APIA 密钥连通正常，但测试笔记未能解析 [" + code + "]"
	}
	return false, false, code, "APIA 密钥或 ID 配置错误 [155]"
}

func getJSON(ctx context.Context, client *http.Client, rawURL string) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	return doJSON(client, request)
}

func postJSON(ctx context.Context, client *http.Client, rawURL string, body []byte) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	return doJSON(client, request)
}

func authorizedJSON(ctx context.Context, client *http.Client, method, rawURL, apiKey string, body []byte) (map[string]any, int, error) {
	request, err := http.NewRequestWithContext(ctx, method, rawURL, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	return doJSON(client, request)
}

func doJSON(client *http.Client, request *http.Request) (map[string]any, int, error) {
	if client == nil {
		client = network.SafeClient()
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, response.StatusCode, err
	}
	var data map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	_ = decoder.Decode(&data)
	return data, response.StatusCode, nil
}

func configReason(data map[string]any, fallback string) string {
	for _, key := range []string{"reason", "error"} {
		if text := stringifyConfig(data[key]); text != "" {
			return text
		}
	}
	return fallback
}

func stringifyConfig(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}
