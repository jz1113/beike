package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
)

var noteKeyPattern = regexp.MustCompile(`(?i)^/(?:explore|discovery/item)/([a-f0-9]{24})(?:/|$)`)

type sourceCheckItem struct {
	URL       string  `json:"url"`
	Resolved  *string `json:"resolvedUrl,omitempty"`
	SourceKey *string `json:"sourceKey,omitempty"`
	State     string  `json:"state"`
	AlbumName *string `json:"albumName,omitempty"`
	AlbumID   any     `json:"albumId,omitempty"`
	Reason    *string `json:"reason,omitempty"`
}

func sourceCheckPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			URLs []json.RawMessage `json:"urls"`
		}
		decoder := json.NewDecoder(r.Body)
		if err := decoder.Decode(&payload); err != nil || len(payload.URLs) > 200 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "每次最多查重 200 条链接"})
			return
		}
		urls := make([]string, 0, len(payload.URLs))
		for _, raw := range payload.URLs {
			var text string
			if json.Unmarshal(raw, &text) != nil || len(text) > 8000 {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "每次最多查重 200 条链接"})
				return
			}
			urls = append(urls, text)
		}
		suffixes, err := loadHostSuffixes(cfg.Root)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查重失败"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查重失败"})
			return
		}
		defer db.Close()
		items := make([]sourceCheckItem, 0, len(urls))
		for _, rawURL := range urls {
			items = append(items, checkOneSource(r.Context(), db, httpx.WorkspaceFrom(r), rawURL, suffixes))
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": items})
	}
}

func checkOneSource(ctx context.Context, db *sql.DB, workspace, rawURL string, suffixes []string) sourceCheckItem {
	resolved := rawURL
	if key := noteSourceKey(rawURL); key == "" {
		parsed, err := url.Parse(rawURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || !hostSuffix(parsed.Hostname(), "xhslink.com") {
			reason := "只支持小红书笔记链接"
			return sourceCheckItem{URL: rawURL, State: "error", Reason: &reason}
		}
		resolved = expandShortLink(ctx, rawURL, suffixes)
	}
	key := noteSourceKey(resolved)
	if key == "" {
		reason := "短链接未能识别笔记，请复制笔记的完整链接后重试"
		return sourceCheckItem{URL: rawURL, State: "error", Reason: &reason}
	}
	row, err := database.LookupImportSource(ctx, db, workspace, key)
	if err != nil {
		reason := "查重失败"
		return sourceCheckItem{URL: rawURL, State: "error", Reason: &reason}
	}
	item := sourceCheckItem{URL: rawURL, Resolved: &resolved, SourceKey: &key, State: "new"}
	if !row.Found {
		return item
	}
	item.State = row.State
	item.AlbumName = &row.AlbumName
	if row.AlbumID.Valid {
		item.AlbumID = row.AlbumID.String
	} else {
		item.AlbumID = json.RawMessage("null")
	}
	return item
}

func noteSourceKey(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
		return ""
	}
	host := strings.ToLower(parsed.Hostname())
	if host != "xiaohongshu.com" && !strings.HasSuffix(host, ".xiaohongshu.com") {
		return ""
	}
	match := noteKeyPattern.FindStringSubmatch(parsed.EscapedPath())
	if match == nil {
		return ""
	}
	return "xhs:" + strings.ToLower(match[1])
}

func hostSuffix(host, root string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == root || strings.HasSuffix(host, "."+root)
}

func expandShortLink(ctx context.Context, raw string, suffixes []string) string {
	parsed, err := url.Parse(raw)
	if err != nil || !allowedRemoteHost(parsed.Hostname(), suffixes) || network.PrivateIP(parsed.Hostname()) {
		return raw
	}
	requestCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, raw, nil)
	if err != nil {
		return raw
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1")
	client := network.SafeClient()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		return raw
	}
	defer response.Body.Close()
	if response.StatusCode < 300 || response.StatusCode >= 400 {
		return raw
	}
	location := response.Header.Get("Location")
	if location == "" {
		return raw
	}
	expanded, err := url.Parse(location)
	if err != nil {
		return raw
	}
	if !expanded.IsAbs() {
		expanded = parsed.ResolveReference(expanded)
	}
	if expanded.User != nil || !allowedRemoteHost(expanded.Hostname(), suffixes) || network.PrivateIP(expanded.Hostname()) {
		return raw
	}
	return expanded.String()
}

func allowedRemoteHost(host string, suffixes []string) bool {
	host = strings.ToLower(strings.TrimSuffix(strings.Trim(host, "[]"), "."))
	if host == "" || host == "localhost" || host == "metadata" || host == "metadata.google.internal" || host == "0.0.0.0" || network.PrivateIP(host) {
		return false
	}
	for _, suffix := range suffixes {
		if hostSuffix(host, suffix) {
			return true
		}
	}
	return false
}

func loadHostSuffixes(root string) ([]string, error) {
	raw, err := os.ReadFile(filepath.Join(root, "src/shared/data/remote-host-suffixes.json"))
	if err != nil {
		return nil, err
	}
	var payload struct {
		Suffixes []string `json:"suffixes"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	return payload.Suffixes, nil
}
