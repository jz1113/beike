package system

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
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
	lianchi := provider == "lianchi"
	openAI := provider == "openai"
	_, independent := payload["apiKey"]
	if openAI && !independent {
		return http.StatusBadRequest, map[string]any{"success": false, "models": []any{}, "error": "请填写独立的 OpenAI API Key"}
	}
	rawURL := firstTextValue(payload["baseUrl"])
	if lianchi {
		rawURL = "https://api.gapnet.ai/endpoint"
	} else if rawURL == "" {
		if openAI {
			rawURL = "https://api.openai.com"
		} else {
			rawURL = firstTextValue(r.Header.Get("x-custom-base-url"), os.Getenv("AI_DRAWING_BASE_URL"), "https://ai.comfly.org")
		}
	}
	target := normalizeGatewayBaseURL(rawURL)
	if openAI && !allowCustomBase(cfg) && !safeHTTPSGateway(target) && !(payload["allowInsecureHttp"] == true && publicHTTPGateway(target)) {
		return http.StatusBadRequest, map[string]any{"success": false, "models": []any{}, "error": "此部署仅允许 HTTPS 地址；如需使用公网 IPv4 的 HTTP 网关，请先在设置中勾选明文传输选项。内网地址和 HTTP 域名不受支持。"}
	}
	key := ""
	if independent {
		key = strings.TrimSpace(firstTextValue(payload["apiKey"]))
	} else if lianchi {
		key = strings.TrimSpace(r.Header.Get("x-lianchi-api-key"))
	} else if !cfg.Production() {
		key = strings.TrimSpace(firstTextValue(r.Header.Get("x-custom-api-key"), os.Getenv("AI_DRAWING_API_KEY")))
	} else {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	ping, _ := payload["isPing"].(bool)
	if independent && key == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "请填写独立接口 API Key", "models": []any{}}
	}
	if lianchi && key == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "请先填写联池 API Key", "models": []any{}}
	}
	if key == "" {
		body := map[string]any{"success": !ping, "count": len(fallback), "models": fallback, "isFallback": true, "warning": "未检测到自定义 API Key，已自动载入官方精选推荐模型库"}
		if ping {
			body["error"] = "请先填写 API Key"
		}
		return http.StatusOK, body
	}
	list, gatewayStatus, gatewayError := readGatewayModels(ctx, client, target, key, openAI)
	if len(list) > 0 {
		var models any
		count := 0
		name := "comfly"
		if lianchi {
			parsed := discoveredModels(cfg.Root, list)
			models = parsed
			count = len(parsed)
			name = "lianchi"
		} else if openAI {
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
	if strict || openAI || failed {
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
	paths := []string{"/v1/models"}
	if openAI {
		paths = []string{"/v1/models", "/models"}
	}
	status := 0
	message := ""
	requestCtx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	for _, path := range paths {
		data, code, err := gatewayGET(requestCtx, client, base+path, key, "")
		if err != nil {
			return nil, 0, "网络连接失败"
		}
		status = code
		if code >= 200 && code < 300 {
			list := modelList(data)
			if len(list) > 0 || path == paths[len(paths)-1] {
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
		if (code != 404 && code != 405) || path == paths[len(paths)-1] {
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
