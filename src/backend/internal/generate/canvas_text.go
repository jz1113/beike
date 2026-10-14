package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func CanvasText(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择模型并填写生成要求（最多 20000 字）"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择模型并填写生成要求（最多 20000 字）"})
			return
		}
		model, _ := payload["model"].(string)
		prompt, _ := payload["prompt"].(string)
		if strings.TrimSpace(model) == "" || utf8.RuneCountInString(strings.TrimSpace(model)) > 200 || strings.TrimSpace(prompt) == "" || utf8.RuneCountInString(strings.TrimSpace(prompt)) > 20000 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择模型并填写生成要求（最多 20000 字）"})
			return
		}
		if message := unsafeCanvasGateway(cfg, r, payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		writeCanvasText(cfg, w, r, payload, body)
	})
}

func unsafeCanvasGateway(cfg config.Config, r *http.Request, payload map[string]any) string {
	bodyBase, _ := payload["customBaseUrl"].(string)
	clientBase := strings.TrimSpace(bodyBase)
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	if clientBase == "" {
		return ""
	}
	format, _ := payload["apiFormat"].(string)
	allowHTTP, _ := payload["allowInsecureHttp"].(bool)
	if system.AllowCustomBase(cfg) || system.SafeHTTPSGateway(clientBase) {
		return ""
	}
	if format == "openai-responses" && allowHTTP && system.PublicHTTPGateway(clientBase) {
		return ""
	}
	return "当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。"
}
