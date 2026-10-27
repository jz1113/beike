package poster

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func headlineImages(cfg config.Config, r *http.Request, urls []string) ([]string, string) {
	root := storage.ResolveRoot()
	if os.Getenv("AZHUO_CACHE_DIR") == "" && cfg.DataDir() != "" {
		root = filepath.Join(cfg.DataDir(), "storage")
	}
	out := make([]string, 0, len(urls))
	for _, item := range urls {
		item = strings.TrimSpace(item)
		if strings.HasPrefix(item, "data:image/") {
			out = append(out, item)
			continue
		}
		parsed, err := url.Parse(item)
		if err != nil || parsed.User != nil {
			return nil, "unread"
		}
		// The UI and API use different development ports. Only a relative
		// storage path or this application's host can resolve a local file.
		local := parsed.Host == "" && parsed.Scheme == "" && strings.HasPrefix(item, "/storage/")
		if (parsed.Scheme == "http" || parsed.Scheme == "https") && strings.HasPrefix(parsed.Path, "/storage/") {
			requestURL := &url.URL{Host: r.Host}
			local = strings.EqualFold(parsed.Hostname(), requestURL.Hostname()) || loopbackHost(parsed.Hostname()) && loopbackHost(requestURL.Hostname())
		}
		if local {
			rel := strings.TrimPrefix(parsed.Path, "/storage/")
			if !storage.WorkspaceRel(rel, httpx.WorkspaceFrom(r), !cfg.Production()) {
				return nil, "unread"
			}
			image, err := media.VisionImageURL(root, "/storage/"+rel)
			if err != nil {
				return nil, "unread"
			}
			out = append(out, image)
			continue
		}
		status, raw, err := generate.PostModelHeaders(r.Context(), http.MethodGet, item, "", nil, 20*time.Second, media.RemoteImageHeaders(item))
		if err != nil || status < 200 || status >= 300 || len(raw) == 0 {
			return nil, "unread"
		}
		out = append(out, item)
	}
	return out, ""
}

func loopbackHost(host string) bool {
	return strings.EqualFold(host, "localhost") || net.ParseIP(host).IsLoopback()
}
