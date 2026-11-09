package system

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func modelFetchHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)); err == nil && json.Valid(raw) {
			_ = json.Unmarshal(raw, &payload)
		}
		if payload == nil {
			payload = map[string]any{}
		}
		if payload["provider"] == "deepseek" {
			status, body := fetchDeepSeek(r.Context(), network.SafeClient(), firstTextValue(payload["apiKey"]))
			httpx.WriteJSON(w, status, body)
			return
		}
		status, body := fetchModelCatalog(r.Context(), cfg, r, payload, network.SafeClient())
		httpx.WriteJSON(w, status, body)
	}
}

func fetchModelCatalog(ctx context.Context, cfg config.Config, r *http.Request, payload map[string]any, client *http.Client) (int, map[string]any) {
	fallback := loadApprovedModels(cfg.Root)
	provider, _ := payload["provider"].(string)
	openAI := provider == "openai"
	_, independent := payload["apiKey"]
	if openAI && !independent {
		return http.StatusBadRequest, map[string]any{"success": false, "models": []any{}, "error": "请填写独立的 OpenAI API Key"}
	}
	defaultBase := firstTextValue(os.Getenv("AI_DRAWING_BASE_URL"), "https://ai.comfly.org")
	rawURL := firstTextValue(payload["baseUrl"])
	if rawURL == "" {
		if openAI {
			rawURL = "https://api.openai.com"
		} else {
			rawURL = firstTextValue(r.Header.Get("x-custom-base-url"), defaultBase)
		}
	}
	target := gateway.NormalizeGatewayBaseURL(rawURL)
	if openAI && !allowCustomBase(cfg) && !safeHTTPSGateway(target) && !(payload["allowInsecureHttp"] == true && publicHTTPGateway(target)) {
		return http.StatusBadRequest, map[string]any{"success": false, "models": []any{}, "error": "此部署仅允许 HTTPS 地址；如需使用公网 IPv4 的 HTTP 网关，请先在设置中勾选明文传输选项。内网地址和 HTTP 域名不受支持。"}
	}
	key := ""
	if independent {
		key = strings.TrimSpace(firstTextValue(payload["apiKey"]))
	} else {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
		// The server credential belongs to its configured gateway, not to a custom catalog URL.
		if key == "" && !cfg.Production() && target == gateway.NormalizeGatewayBaseURL(defaultBase) {
			key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		}
	}
	ping, _ := payload["isPing"].(bool)
	if independent && key == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "请填写独立接口 API Key", "models": []any{}}
	}
	if key == "" {
		body := map[string]any{"success": !ping, "count": len(fallback), "models": fallback, "isFallback": true, "warning": "未检测到自定义 API Key，已自动载入官方精选推荐模型库"}
		if ping {
			body["error"] = "请先填写 API Key"
		}
		return http.StatusOK, body
	}
	var list []any
	var gatewayStatus int
	var gatewayError string
	nativeProtocol := catalogNativeProtocol(payload, rawURL)
	if nativeProtocol != "" {
		list, gatewayStatus, gatewayError = readNativeModels(ctx, client, rawURL, key, nativeProtocol)
	} else {
		list, gatewayStatus, gatewayError = readGatewayModels(ctx, client, target, key, openAI)
	}
	if len(list) > 0 {
		var models any
		count := 0
		name := "comfly"
		if openAI {
			parsed := openAIModels(cfg.Root, list)
			models = parsed
			count = len(parsed)
			name = "openai"
		} else {
			parsed := discoveredModels(cfg.Root, list)
			models = parsed
			count = len(parsed)
		}
		return http.StatusOK, map[string]any{"success": true, "gatewayStatus": 200, "count": count, "models": models, "provider": name}
	}
	strict, _ := payload["strict"].(bool)
	failed := gatewayStatus == 401 || gatewayStatus == 403 || gatewayStatus == 404 || gatewayStatus == 500 || gatewayStatus == 200
	if strict || openAI || nativeProtocol != "" || failed {
		if gatewayError == "" {
			gatewayError = "未发现可用模型"
		}
		status := gatewayStatus
		if status < 400 {
			status = http.StatusBadGateway
		}
		return status, map[string]any{"success": false, "models": []any{}, "gatewayStatus": status, "error": gatewayError}
	}
	if ping {
		status := gatewayStatus
		if status != 401 && status != 403 {
			status = http.StatusGatewayTimeout
		}
		return status, map[string]any{"success": false, "gatewayStatus": status, "error": gatewayError, "isFallback": true, "models": fallback}
	}
	warning := "已自动为您载入官方精选旗舰模型库（生图/生视频/多模态），可直接勾选启用"
	if gatewayError != "" {
		warning = "远端网关暂时不可用 (" + gatewayError + ")，已自动载入官方精选推荐模型库"
	}
	return http.StatusOK, map[string]any{"success": true, "gatewayStatus": gatewayStatus, "count": len(fallback), "models": fallback, "isFallback": true, "warning": warning}
}

func readGatewayModels(ctx context.Context, client *http.Client, base, key string, openAI bool) ([]any, int, string) {
	endpoints := []string{gateway.ModelsURL(base)}
	if openAI && !gateway.IsDashScopeGateway(base) {
		root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
		endpoints = []string{root + "/v1/models", root + "/models"}
	}
	status := 0
	message := ""
	requestCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	for index, endpoint := range endpoints {
		data, code, err := gatewayGET(requestCtx, client, endpoint, key, "")
		if err != nil {
			return nil, 0, "网络连接失败"
		}
		status = code
		if code >= 200 && code < 300 {
			list := modelList(data)
			if len(list) > 0 || index == len(endpoints)-1 {
				if len(list) == 0 {
					message = "模型目录返回空列表或不兼容格式；可导入 CC Switch/Codex 目录，或手动填写模型 ID"
				}
				return list, code, message
			}
			continue
		}
		message = firstTextValue(data["message"])
		if nested, ok := data["error"].(map[string]any); ok {
			message = firstTextValue(nested["message"], message)
		}
		if message == "" {
			message = "HTTP " + strconv.Itoa(code)
		}
		if (code != 404 && code != 405) || index == len(endpoints)-1 {
			break
		}
	}
	if openAI && (status == 404 || status == 405) {
		message = "该网关未提供模型目录接口（/v1/models 或 /models）；可导入 CC Switch/Codex 目录，或手动添加模型 ID"
	}
	return nil, status, message
}

func fetchDeepSeek(ctx context.Context, client *http.Client, apiKey string) (int, map[string]any) {
	if strings.TrimSpace(apiKey) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "provider": "deepseek", "models": []any{}, "error": "请填写 DeepSeek 独立 API Key"}
	}
	requestCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	data, status, err := gatewayGET(requestCtx, client, "https://api.deepseek.com/models", strings.TrimSpace(apiKey), "")
	if err != nil {
		return http.StatusBadGateway, map[string]any{"success": false, "provider": "deepseek", "models": []any{}, "error": "DeepSeek 模型目录请求超时或连接失败，请重试"}
	}
	list, _ := data["data"].([]any)
	if status < 200 || status >= 300 || list == nil {
		code := status
		if code < 400 {
			code = http.StatusBadGateway
		}
		return code, map[string]any{"success": false, "provider": "deepseek", "models": []any{}, "error": "DeepSeek 模型目录获取失败（HTTP " + strconv.Itoa(status) + "）"}
	}
	seen := map[string]struct{}{}
	models := []map[string]any{}
	for _, item := range list {
		object, _ := item.(map[string]any)
		id := strings.TrimSpace(firstTextValue(object["id"]))
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		name := firstTextValue(object["name"], id)
		models = append(models, map[string]any{"id": id, "name": name})
	}
	return http.StatusOK, map[string]any{"success": true, "provider": "deepseek", "models": models}
}

func modelList(data map[string]any) []any {
	if list, ok := data["data"].([]any); ok {
		return list
	}
	if list, ok := data["models"].([]any); ok {
		return list
	}
	return nil
}

func discoveredModels(root string, list []any) []catalogModel {
	seen := map[string]struct{}{}
	models := []catalogModel{}
	for _, item := range list {
		id := strings.TrimSpace(modelID(item))
		if id == "" {
			continue
		}
		if _, exists := seen[strings.ToLower(id)]; exists {
			continue
		}
		seen[strings.ToLower(id)] = struct{}{}
		approved, ok := approvedModel(root, id)
		if !ok {
			approved = catalogModel{
				ID:         id,
				Name:       id,
				ShortName:  id,
				Category:   "text",
				Capability: "custom",
			}
		} else {
			approved.ID = id
			if approved.Name == "" {
				approved.Name = id
			}
			if approved.ShortName == "" {
				approved.ShortName = id
			}
		}
		models = append(models, approved)
	}
	return models
}

func openAIModels(root string, list []any) []map[string]any {
	seen := map[string]struct{}{}
	models := []map[string]any{}
	for _, item := range list {
		id := strings.TrimSpace(modelID(item))
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		approved, ok := approvedModel(root, id)
		supported := true
		name := id
		short := id
		if ok {
			name = approved.Name
			short = approved.ShortName
		}
		models = append(models, map[string]any{"id": id, "name": name, "shortName": short, "supported": supported, "owned_by": "openai", "isCustom": !ok})
	}
	return models
}

func modelID(item any) string {
	switch typed := item.(type) {
	case string:
		return typed
	case map[string]any:
		return firstTextValue(typed["id"], typed["name"])
	default:
		return ""
	}
}

func allowCustomBase(cfg config.Config) bool {
	return !cfg.Production() || os.Getenv("ALLOW_CUSTOM_BASE_URL") == "true"
}

func safeHTTPSGateway(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	return !network.PrivateIP(parsed.Hostname()) && !strings.EqualFold(parsed.Hostname(), "localhost")
}

func publicHTTPGateway(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	return !network.PrivateIP(parsed.Hostname()) && strings.Count(parsed.Hostname(), ".") == 3
}

func requestTextProtocol(payload map[string]any) (string, bool) {
	value, exists := payload["textProtocol"]
	if !exists {
		return "", true
	}
	protocol, ok := value.(string)
	if !ok {
		return "", false
	}
	switch protocol {
	case "", "auto", "openai", "gemini", "anthropic":
		return protocol, true
	default:
		return "", false
	}
}

func catalogNativeProtocol(payload map[string]any, base string) string {
	for _, field := range []string{"catalogProtocol", "providerType", "provider", "textProtocol"} {
		value, _ := payload[field].(string)
		switch value {
		case "gemini", "anthropic":
			return value
		case "openai":
			return ""
		}
	}
	parsed, _ := url.Parse(base)
	if parsed != nil {
		switch strings.ToLower(parsed.Hostname()) {
		case "generativelanguage.googleapis.com":
			return "gemini"
		case "api.anthropic.com":
			return "anthropic"
		}
	}
	return ""
}

func readNativeModels(ctx context.Context, client *http.Client, base, key, protocol string) ([]any, int, string) {
	parsed, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, http.StatusBadRequest, "模型目录地址无效"
	}
	root := strings.TrimRight(parsed.Path, "/")
	if strings.HasSuffix(root, "/models") {
		root = strings.TrimSuffix(root, "/models")
	}
	if protocol == "gemini" {
		root = strings.TrimSuffix(root, "/v1")
		if !strings.HasSuffix(root, "/v1beta") {
			root += "/v1beta"
		}
	} else if !strings.HasSuffix(root, "/v1") {
		root += "/v1"
	}
	parsed.Path = root + "/models"
	requestCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	copyClient := *client
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("原生模型目录不允许重定向") }
	list := []any{}
	seenPages := map[string]bool{}
	page := ""
	for count := 0; count < 20; count++ {
		query := url.Values{}
		if page != "" {
			if protocol == "gemini" {
				query.Set("pageToken", page)
			} else {
				query.Set("after_id", page)
			}
		}
		parsed.RawQuery = query.Encode()
		request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, parsed.String(), nil)
		if err != nil {
			return nil, 0, "模型目录请求构造失败"
		}
		if protocol == "gemini" {
			request.Header.Set("x-goog-api-key", key)
		} else {
			request.Header.Set("x-api-key", key)
			request.Header.Set("anthropic-version", "2023-06-01")
		}
		response, err := copyClient.Do(request)
		if err != nil {
			return nil, 0, "原生模型目录连接失败"
		}
		raw, readErr := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
		response.Body.Close()
		var data map[string]any
		if readErr != nil || len(raw) > 4<<20 || json.Unmarshal(raw, &data) != nil {
			return nil, response.StatusCode, "原生模型目录返回无效或过大的响应"
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, response.StatusCode, "原生模型目录请求失败；请检查该渠道是否支持所选原生接口及密钥权限"
		}
		field := "data"
		if protocol == "gemini" {
			field = "models"
		}
		items, ok := data[field].([]any)
		if !ok {
			return nil, http.StatusBadGateway, "原生模型目录响应格式不兼容"
		}
		for _, item := range items {
			object, _ := item.(map[string]any)
			id := firstTextValue(object["id"])
			if protocol == "gemini" {
				id = strings.TrimPrefix(firstTextValue(object["name"]), "models/")
			}
			if id != "" {
				list = append(list, map[string]any{"id": id, "name": firstTextValue(object["displayName"], object["display_name"], id)})
			}
		}
		if protocol == "gemini" {
			page = firstTextValue(data["nextPageToken"])
		} else {
			page = ""
			if data["has_more"] == true {
				page = firstTextValue(data["last_id"])
			}
		}
		if page == "" {
			return list, http.StatusOK, ""
		}
		if seenPages[page] {
			return nil, http.StatusBadGateway, "原生模型目录分页未前进"
		}
		seenPages[page] = true
	}
	return nil, http.StatusBadGateway, "原生模型目录分页超过限制，请缩小目录或手动添加模型"
}
