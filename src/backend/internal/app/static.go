package app

import (
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
)

func staticHandler(cfg config.Config) http.Handler {
	dist := cfg.WebDistDir
	indexPath := filepath.Join(dist, "index.html")
	index, err := os.ReadFile(indexPath)
	if err != nil {
		return http.NotFoundHandler()
	}
	fileServer := http.FileServer(http.Dir(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			writeIndex(w, cfg, index)
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
		writeIndex(w, cfg, index)
	})
}

func writeIndex(w http.ResponseWriter, cfg config.Config, index []byte) {
	if cfg.AccessToken != "" {
		http.SetCookie(w, &http.Cookie{
			Name:     "app_token",
			Value:    url.QueryEscape(cfg.AccessToken),
			Path:     "/",
			MaxAge:   60 * 60 * 24 * 30,
			SameSite: http.SameSiteLaxMode,
		})
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(index)
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
