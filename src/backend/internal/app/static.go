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
	"beike.local/cloud/src/backend/internal/platform/database"
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

func withPublicCatalog(cfg config.Config, pattern string, catalog, protected http.Handler) http.Handler {
	if !cfg.Production() {
		return protected
	}
	var public http.Handler
	switch pattern {
	case "GET /api/catalog/assets/library", "GET /api/sales/studio-assets":
		public = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Query().Has("export") {
				protected.ServeHTTP(w, r)
				return
			}
			catalog.ServeHTTP(w, r.WithContext(httpx.WithWorkspace(r.Context(), database.OfficialWorkspace)))
		})
	case "GET /api/catalog/skills":
		// The frontend merges in its bundled public skills.
		public = publicCatalogResponse(map[string]any{"success": true, "skills": []any{}, "hiddenOfficialRecipes": []any{}})
	case "GET /api/sales/scripts":
		public = publicCatalogResponse(map[string]any{"success": true, "items": []any{}})
	case "GET /api/sales/asset-view-jobs":
		public = publicCatalogResponse(map[string]any{"success": true, "jobs": []any{}})
	case "GET /api/library/preferences":
		public = publicCatalogResponse(map[string]any{"success": true, "showEntry": true, "sharingEnabled": false})
	default:
		return protected
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != http.MethodGet || httpx.Authorized(r, cfg) {
			protected.ServeHTTP(w, r)
			return
		}
		public.ServeHTTP(w, r)
	})
}

func publicCatalogResponse(body map[string]any) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, body)
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
	if cfg.Production() && cfg.PublicWeb {
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			httpx.IssuePublicSession(w, r, cfg)
		}
	} else if shouldIssueIndexCookie(r, cfg) {
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
		return strings.TrimSpace(r.Header.Get("X-Beike-Web-User")) != ""
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
