package generate

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func DepthVideo(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			depthVideoPoll(cfg, w, r)
			return
		}
		if !system.FFmpegReady(cfg.Root) {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false, "submissionRejected": true,
				"error": "深度动作捕捉服务未就绪：请重启 API 服务（npm run dev:api）或执行 npm run setup:depth-env",
			})
			return
		}
		if !system.DepthModelReady(cfg.Root) {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false, "submissionRejected": true,
				"error": "深度模型未就绪，请在终端执行：" + depthSetupCommand,
			})
			return
		}
		depthVideoSubmit(cfg, w, r)
	})
}
