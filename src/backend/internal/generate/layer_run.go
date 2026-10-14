package generate

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func runLayer(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]any) {
	base, apiKey, model := layerTarget(cfg, r, payload)
	if apiKey == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请先配置聚合平台 API 密钥"})
		return
	}
	if model == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请配置平台实际开放的 LAYER_GATEWAY_MODEL，不能使用文档页面标题代替模型 ID"})
		return
	}
	size, _ := payload["size"].(string)
	if size == "" {
		size = "auto"
	}
	body := map[string]any{
		"model": model, "image": payload["image"], "prompt": payload["prompt"], "size": size,
		"layer_decomposition": true, "output_format": "png", "response_format": "url", "watermark": false,
	}
	status, raw, err := postModel(r.Context(), http.MethodPost, base+"/images/generations", apiKey, body, 300*time.Second)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "图层拆分失败；请核对平台任务记录后再重试"})
		return
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": "图层接口返回非 JSON（HTTP " + itoa(status) + "），请检查平台接口是否开放"})
		return
	}
	if status < 200 || status >= 300 {
		message := "图层拆分失败（" + itoa(status) + "）"
		if nested, ok := data["error"].(map[string]any); ok {
			if text, ok := nested["message"].(string); ok && text != "" {
				message = text
			}
		}
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": message})
		return
	}
	layers, message := parseLayers(data)
	if message != "" {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"success": false, "error": message})
		return
	}
	temporary := false
	for _, layer := range layers {
		if url, _ := layer["url"].(string); regexp.MustCompile(`^https?:`).MatchString(url) {
			temporary = true
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "layers": layers, "temporaryUrls": temporary})
}

func layerTarget(cfg config.Config, r *http.Request, payload map[string]any) (string, string, string) {
	if key := strings.TrimSpace(os.Getenv("ARK_LAYER_API_KEY")); key != "" {
		model := strings.TrimSpace(os.Getenv("ARK_LAYER_MODEL"))
		if model == "" {
			model = "doubao-seedream-5-0-pro-260628"
		}
		return "https://ark.cn-beijing.volces.com/api/v3", key, model
	}
	clientBase := strings.TrimSpace(stringField(payload, "customBaseUrl"))
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := imageDefaultBase()
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	model := strings.TrimSpace(os.Getenv("LAYER_GATEWAY_MODEL"))
	if model == "" {
		model = "seedream-v5-pro/layer-decomposition"
	}
	return strings.TrimRight(base, "/") + "/v1", headlineAPIKey(cfg, r, payload, clientBase), model
}

func parseLayers(data map[string]any) ([]map[string]any, string) {
	items := layerItems(data["data"])
	if len(items) < 2 || len(items) > 17 {
		return nil, "接口未返回底图和独立图层，请确认网关支持图层拆分"
	}
	separate := true
	for _, item := range items {
		if item["z_index"] != nil || item["bounding_box"] != nil {
			separate = false
		}
	}
	layers := make([]map[string]any, 0, len(items))
	for index, item := range items {
		url := layerURL(item)
		if url == "" {
			return nil, "图层图片地址无效"
		}
		width, height := layerSize(item["size"])
		if separate {
			name, _ := item["name"].(string)
			if name == "" {
				name = "图层 " + itoa(index+1)
			}
			layers = append(layers, map[string]any{"url": url, "name": name, "zIndex": index, "width": width, "height": height, "placement": "separate"})
			continue
		}
		zIndex, ok := item["z_index"].(float64)
		if !ok || width <= 0 || height <= 0 {
			return nil, "图层响应缺少有效的图片、尺寸或叠放顺序"
		}
		name, _ := item["name"].(string)
		if name == "" {
			name = "图层 " + itoa(int(zIndex))
			if zIndex == 0 {
				name = "底图"
			}
		}
		layer := map[string]any{"url": url, "name": name, "zIndex": int(zIndex), "width": width, "height": height}
		layers = append(layers, layer)
	}
	return layers, ""
}

func layerItems(value any) []map[string]any {
	if nested, ok := value.(map[string]any); ok {
		value = nested["data"]
	}
	items, _ := value.([]any)
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if mapped, ok := item.(map[string]any); ok {
			out = append(out, mapped)
		}
	}
	return out
}

func layerURL(item map[string]any) string {
	if url, ok := item["url"].(string); ok && (strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") || strings.HasPrefix(url, "data:image/png;base64,")) {
		return url
	}
	if b64, ok := item["b64_json"].(string); ok && b64 != "" {
		return "data:image/png;base64," + b64
	}
	return ""
}

func layerSize(value any) (int, int) {
	text, _ := value.(string)
	parts := strings.Split(text, "x")
	if len(parts) != 2 {
		return 0, 0
	}
	var width, height int
	for _, digit := range parts[0] {
		width = width*10 + int(digit-'0')
	}
	for _, digit := range parts[1] {
		height = height*10 + int(digit-'0')
	}
	return width, height
}
