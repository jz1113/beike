package depth

import (
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

const depthSetupCommand = "npm run setup:depth-model"

func DepthImage(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			status, body := readDepthSubmission(cfg, r, "depth-image")
			httpx.WriteJSON(w, status, body)
			return
		}
		if !system.DepthModelReady(cfg.Root) {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false, "submissionRejected": true,
				"error": "深度模型未就绪，请在终端执行：" + depthSetupCommand,
			})
			return
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请使用 multipart/form-data 上传图片"})
			return
		}
		depthImageForm(cfg, w, r)
	})
}
