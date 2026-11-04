package generate

import (
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

// Preserve tool calls and multimodal messages when the canvas uses its text model.
func writeCanvasChat(cfg config.Config, w http.ResponseWriter, r *http.Request, p map[string]any) {
	model, _ := p["model"].(string)
	base, key, upstream, status, message := canvasCredentials(cfg, r, p, model)
	if message != "" {
		httpx.WriteJSON(w, status, map[string]any{"error": message})
		return
	}
	wire := map[string]any{"model": upstream}
	for _, field := range []string{"messages", "tools", "tool_choice", "temperature", "max_tokens", "response_format", "reasoning_effort"} {
		if v := p[field]; v != nil {
			wire[field] = v
		}
	}
	req := gateway.TextRequest{BaseURL: base, APIKey: key, Protocol: gateway.TextProtocolForBase(r.Context(), upstream, base), Payload: wire, Client: canvasHTTP(), Timeout: 3 * time.Minute}
	complete := gateway.CompleteText
	if p["apiFormat"] == "openai-responses" {
		complete = gateway.CompleteResponses
	}
	status, data, err := complete(r.Context(), req)
	if err != nil || status < 200 || status >= 300 || data["choices"] == nil {
		httpx.WriteJSON(w, http.StatusBadGateway, map[string]any{"error": "贝壳云图文本模型请求失败，请检查后台模型服务"})
		return
	}
	choices, _ := data["choices"].([]any)
	for _, value := range choices {
		choice, _ := value.(map[string]any)
		message, _ := choice["message"].(map[string]any)
		delete(message, "native_content")
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"choices": choices, "model": upstream, "usage": data["usage"], "object": "chat.completion"})
}
