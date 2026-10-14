package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func LayerDecomposition(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 44<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请传入不超过 30MB 的 PNG/JPEG 图片"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请传入不超过 30MB 的 PNG/JPEG 图片"})
			return
		}
		image, _ := payload["image"].(string)
		if !strings.HasPrefix(image, "data:image/png;base64,") && !strings.HasPrefix(image, "data:image/jpeg;base64,") || len(image) > 42_000_000 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请传入不超过 30MB 的 PNG/JPEG 图片"})
			return
		}
		size, _ := payload["size"].(string)
		if size == "" {
			size = "auto"
		}
		if size != "auto" && size != "1K" && size != "1.5K" && size != "2K" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "拆分分辨率不支持"})
			return
		}
		model, _ := payload["model"].(string)
		if model != "seedream-v5-pro/layer-decomposition" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请选择支持图层拆分的模型"})
			return
		}
		if message := layerAccessError(cfg, r, payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		runLayer(cfg, w, r, payload)
	})
}
