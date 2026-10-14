package generate

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func Analyze(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "请求数据格式异常"})
			return
		}
		if message := analyzeBodyError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": message})
			return
		}
		if status, fields := analyzeGatewayError(cfg, r, payload); status != 0 {
			httpx.WriteJSON(w, status, fields)
			return
		}
		runAnalyze(cfg, w, r, payload)
	})
}
