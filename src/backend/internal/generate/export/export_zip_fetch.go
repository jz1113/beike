package export

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

var legacyExportMedia = regexp.MustCompile(`(?i)^generated/(images|videos)/local/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$`)

func exportLocalMediaAllowed(cfg config.Config, r *http.Request, rel string) bool {
	if path.Clean(rel) != rel || strings.ContainsAny(rel, "\\\x00") {
		return false
	}
	workspace := httpx.WorkspaceFrom(r)
	if storage.WorkspaceRel(rel, workspace, !cfg.Production()) {
		return true
	}
	// Match the storage endpoint's compatibility rules for older, unscoped task media.
	if !legacyExportMedia.MatchString(rel) {
		return false
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return false
	}
	defer db.Close()
	owners, err := database.ImageTaskOwners(r.Context(), db, "/storage/"+rel)
	if err != nil {
		return false
	}
	for _, owner := range owners {
		if owner == workspace {
			return true
		}
	}
	return len(owners) == 0
}

func fetchRemoteExport(cfg config.Config, r *http.Request, raw string, video bool) ([]byte, string, error) {
	raw = normalizeExportRemote(raw)
	if err := exportRemoteRefusal(cfg, raw); err != nil {
		return nil, "", err
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return nil, "", errors.New("Invalid URL")
	}
	limit := 25 << 20
	if video {
		limit = 200 << 20
	}
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		for _, referer := range exportHeaderPlans(parsed.Hostname()) {
			request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, raw, nil)
			if err != nil {
				return nil, "", errors.New("下载失败（HTTP 网络异常）")
			}
			if referer != "" {
				request.Header.Set("Referer", referer)
			}
			request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36")
			request.Header.Set("Accept", "*/*")
			response, err := exportClient(cfg).Do(request)
			if err != nil {
				if safe := exportSafeError(err); safe != nil {
					return nil, "", safe
				}
				last = errors.New("下载失败（HTTP 网络异常）")
				continue
			}
			if response.StatusCode == http.StatusPartialContent || response.Header.Get("Content-Range") != "" {
				response.Body.Close()
				return nil, "", errors.New("下载地址仅返回部分文件，无法打包完整媒体")
			}
			if response.StatusCode != http.StatusOK {
				response.Body.Close()
				last = fmt.Errorf("下载失败（HTTP %d）", response.StatusCode)
				if !remoteStatusRetries(response.StatusCode) {
					return nil, "", last
				}
				continue
			}
			body, err := io.ReadAll(io.LimitReader(response.Body, int64(limit)+1))
			response.Body.Close()
			if err != nil || len(body) > limit {
				return nil, "", fmt.Errorf("媒体文件超过 %d MB 导出上限", limit/1024/1024)
			}
			if len(body) == 0 {
				return nil, "", errors.New("媒体文件为空")
			}
			if !mediaBodyAllowed(response.Header.Get("Content-Type"), raw, body) {
				return nil, "", errors.New("下载地址返回了错误页面或非媒体文件")
			}
			return body, exportExt(parsed.Path, video), nil
		}
	}
	if last == nil {
		last = errors.New("下载失败（HTTP 网络异常）")
	}
	return nil, "", last
}

func exportHeaderPlans(host string) []string {
	host = strings.ToLower(host)
	referer := exportReferer(host)
	if strings.Contains(host, "aiproxy.vip") || strings.Contains(host, "comfly.org") {
		return []string{"", referer}
	}
	if referer == "" {
		return []string{""}
	}
	return []string{referer, ""}
}

func exportReferer(host string) string {
	rules := []struct {
		suffixes []string
		referer  string
	}{
		{[]string{"xhscdn.com", "xiaohongshu.com"}, "https://www.xiaohongshu.com/"},
		{[]string{"douyinpic.com", "byteimg.com", "pstatp.com", "snssdk.com", "bytecdn.cn"}, "https://www.douyin.com/"},
		{[]string{"kuaishou.com", "yximgs.com", "kwaicdn.com", "kwimgs.com"}, "https://www.kuaishou.com/"},
		{[]string{"360buyimg.com", "jd.com"}, "https://item.jd.com/"},
		{[]string{"alicdn.com", "taobaocdn.com", "taobao.com", "tmall.com"}, "https://item.taobao.com/"},
		{[]string{"aiproxy.vip", "comfly.org"}, "https://api.aiproxy.vip/"},
	}
	for _, rule := range rules {
		for _, suffix := range rule.suffixes {
			if host == suffix || strings.HasSuffix(host, "."+suffix) {
				return rule.referer
			}
		}
	}
	return ""
}

func remoteStatusRetries(status int) bool {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusRequestTimeout, 425, http.StatusTooManyRequests:
		return true
	default:
		return status >= 500
	}
}

func mediaBodyAllowed(contentType, raw string, body []byte) bool {
	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	path := raw
	if cut := strings.IndexAny(path, "?#"); cut >= 0 {
		path = path[:cut]
	}
	switch mimeType {
	case "text/html", "application/xhtml+xml":
		return false
	case "application/json":
		if !strings.HasSuffix(strings.ToLower(path), ".json") {
			return false
		}
	case "text/plain":
		if !strings.HasSuffix(strings.ToLower(path), ".txt") {
			return false
		}
	case "image/svg+xml":
		if !strings.HasSuffix(strings.ToLower(path), ".svg") && !strings.HasPrefix(raw, "data:image/svg+xml") {
			return false
		}
	}
	prefix := strings.TrimLeft(string(body[:min(len(body), 512)]), " \t\r\n")
	if htmlPrefix.MatchString(prefix) {
		return false
	}
	if (mimeType == "" || mimeType == "application/octet-stream") && (jsonErrorPrefix.MatchString(prefix) || jsonFailedPrefix.MatchString(prefix)) {
		return false
	}
	return true
}

var htmlPrefix = regexp.MustCompile(`(?i)^(?:<!doctype\s+html|<html\b)`)
var jsonErrorPrefix = regexp.MustCompile(`^\{\s*"(?:error|message)"\s*:`)
var jsonFailedPrefix = regexp.MustCompile(`^\{[^}]*"success"\s*:\s*false`)

func normalizeExportRemote(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "//") {
		return "https:" + raw
	}
	return raw
}

func exportRemoteRefusal(cfg config.Config, raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		if err != nil || parsed == nil || parsed.Scheme == "" || !strings.Contains(raw, "://") {
			return errors.New("Invalid URL")
		}
		return errors.New("Host not allowed")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("Only http(s) URLs allowed")
	}
	if cfg.Production() && parsed.Scheme != "https" {
		return errors.New("Only https URLs allowed in production")
	}
	host := strings.ToLower(strings.Trim(strings.TrimSuffix(parsed.Hostname(), "."), "[]"))
	if host == "" || exportBlockedHost(host) || network.PrivateIP(host) {
		return errors.New("Host not allowed")
	}
	if !system.RemoteHostAllowed(cfg, host) {
		return errors.New("Host not allowed: " + host)
	}
	if parsed.User != nil {
		return errors.New("地址不得包含账号或密码")
	}
	return nil
}

func exportBlockedHost(host string) bool {
	switch host {
	case "localhost", "metadata.google.internal", "metadata", "0.0.0.0":
		return true
	default:
		return false
	}
}

func exportClient(cfg config.Config) *http.Client {
	client := network.SafeClient()
	client.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= 3 {
			return errors.New("stopped after 3 redirects")
		}
		if err := exportRemoteRefusal(cfg, request.URL.String()); err != nil {
			return err
		}
		return nil
	}
	return client
}

func exportSafeError(err error) error {
	var wrapped *url.Error
	if errors.As(err, &wrapped) && wrapped.Err != nil {
		err = wrapped.Err
	}
	if exportFailureKept(err.Error()) && !strings.HasPrefix(err.Error(), "下载失败（HTTP ") && !strings.HasPrefix(err.Error(), "媒体文件超过 ") {
		return err
	}
	return nil
}

func exportFailureKept(text string) bool {
	switch {
	case strings.HasPrefix(text, "下载失败（HTTP "):
		return true
	case strings.HasPrefix(text, "Host not allowed"):
		return true
	case strings.HasPrefix(text, "媒体文件超过 "):
		return true
	case text == "下载地址返回了错误页面或非媒体文件":
		return true
	case text == "下载地址仅返回部分文件，无法打包完整媒体":
		return true
	case text == "媒体文件为空":
		return true
	case text == "Only http(s) URLs allowed":
		return true
	case text == "Only https URLs allowed in production":
		return true
	case text == "Invalid URL":
		return true
	case text == "地址不得包含账号或密码":
		return true
	case text == "Resolved to private IP":
		return true
	case text == "DNS lookup failed for host":
		return true
	case text == "浏览器临时媒体需要先保存到媒体库再打包":
		return true
	default:
		return false
	}
}
