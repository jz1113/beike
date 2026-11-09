package app

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

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

func health(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{"success": true, "ok": true}
		if session := httpx.MediaSession(r, cfg); session != nil {
			body["mediaSession"] = session
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(body)
	}
}

func staticHandler(cfg config.Config) http.Handler {
	dist := cfg.WebDistDir
	indexPath := filepath.Join(dist, "index.html")
	index, err := os.ReadFile(indexPath)
	if err != nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServer(http.Dir(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			writeIndex(w, r, cfg, index)
			return
		}
		target, ok := withinDist(dist, r.URL.Path)
		if !ok {
			http.NotFound(w, r)
			return
		}
		info, err := os.Stat(target)
		if err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api") || strings.HasPrefix(r.URL.Path, "/storage") {
			http.NotFound(w, r)
			return
		}
		writeIndex(w, r, cfg, index)
	})
}

func writeIndex(w http.ResponseWriter, r *http.Request, cfg config.Config, index []byte) {
	if shouldIssueIndexCookie(r, cfg) {
		http.SetCookie(w, &http.Cookie{
			Name:     "app_token",
			Value:    url.QueryEscape(cfg.AccessToken),
			Path:     "/",
			MaxAge:   60 * 60 * 24 * 30,
			HttpOnly: cfg.Production(),
			Secure:   cfg.Production() || r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https"),
			SameSite: http.SameSiteLaxMode,
		})
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(index)
}

func shouldIssueIndexCookie(r *http.Request, cfg config.Config) bool {
	if cfg.AccessToken == "" {
		return false
	}
	if !cfg.Production() || httpx.Authorized(r, cfg) {
		return true
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		host = strings.TrimSpace(r.RemoteAddr)
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	if ip == nil || !ip.IsLoopback() {
		return false
	}
	if strings.TrimSpace(r.Header.Get("X-Forwarded-For")) != "" || strings.TrimSpace(r.Header.Get("X-Real-IP")) != "" {
		return strings.TrimSpace(r.Header.Get("Authorization")) != ""
	}
	return true
}

func withinDist(dist, requestPath string) (string, bool) {
	rel := strings.TrimPrefix(path.Clean("/"+requestPath), "/")
	target := filepath.Join(dist, filepath.FromSlash(rel))
	back, err := filepath.Rel(dist, target)
	if err != nil || back == ".." || strings.HasPrefix(back, ".."+string(os.PathSeparator)) {
		return "", false
	}
	return target, true
}
