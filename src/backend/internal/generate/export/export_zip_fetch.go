package export

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
)

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
