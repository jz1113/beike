package poster

import (
	"beike.local/cloud/src/backend/internal/generate"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func HeadlineDesign(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		if message := headlineDesignSchemaError(body); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常"})
			return
		}
		var ok bool
		r, ok = generate.BindTextProtocol(w, r, payload)
		if !ok {
			return
		}
		images, _ := payload["imageUrls"].([]any)
		product, _ := payload["productTitle"].(string)
		original, _ := payload["originalTitle"].(string)
		cover, _ := payload["coverTitle"].(string)
		if original == "" {
			original = product
		}
		if cover == "" {
			cover = product
		}
		if (len(images) == 1 || len(images) == 2) && (strings.TrimSpace(original) == "" || strings.TrimSpace(cover) == "") {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少原标题或已确认的封面标题"})
			return
		}
		if message := generate.HeadlineAccessError(cfg, r, payload, "未配置封面设计模型的 API Key，未提交生图任务。"); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		runHeadlineDesign(cfg, w, r, payload)
	})
}
