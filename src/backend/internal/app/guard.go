package app

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func protect(cfg config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.AccessToken == "" {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false,
				"error":   "服务端未配置访问令牌，请联系管理员",
			})
			return
		}
		if !httpx.Authorized(r, cfg) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{
				"success": false,
				"error":   "未授权：访问令牌缺失或无效",
			})
			return
		}
		workspace, ok := httpx.ResolveWorkspace(r, cfg)
		if !ok {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{
				"success": false,
				"error":   "缺少工作区密钥",
			})
			return
		}
		next.ServeHTTP(w, r.WithContext(httpx.WithWorkspace(r.Context(), workspace)))
	})
}
