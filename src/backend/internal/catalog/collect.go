package catalog

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/collect"
	"beike.local/cloud/src/backend/internal/platform/network"
)

func collectHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.UseNumber()
		var payload map[string]any
		if err := decoder.Decode(&payload); err != nil || payload == nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求体必须为有效的 JSON"})
			return
		}
		if text, ok := payload["url"].(string); ok && len(text) > 4096 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "url: String must contain at most 4096 character(s)"})
			return
		}
		if text, ok := payload["platform"].(string); ok && len(text) > 64 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "platform: String must contain at most 64 character(s)"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "采集遇到未知异常"})
			return
		}
		defer db.Close()
		apiKey := strings.TrimSpace(r.Header.Get("x-wanbang-key"))
		apiSecret := strings.TrimSpace(r.Header.Get("x-wanbang-secret"))
		if !cfg.Production() {
			if apiKey == "" {
				apiKey = strings.TrimSpace(os.Getenv("WANBANG_API_KEY"))
			}
			if apiSecret == "" {
				apiSecret = strings.TrimSpace(os.Getenv("WANBANG_API_SECRET"))
			}
		}
		result := collect.Product(r.Context(), db, httpx.WorkspaceFrom(r), payload, apiKey, apiSecret, network.SafeClient())
		httpx.WriteJSON(w, result.Status, result.Body)
	}
}
