package system

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/mediasign"
	"beike.local/cloud/src/backend/internal/platform/network"
)

const maxProxyBytes = 25 << 20

var videoURLPattern = regexp.MustCompile(`(?i)\.(mp4|mov|webm|avi|m4v)(\?|!|$)`)
var videoHostPattern = regexp.MustCompile(`(?i)video|snssdk\.com|bytecdn\.cn|yximgs|kwaicdn|kwimgs|kwai\.|kuaishou|douyinvod`)

type proxyCacheEntry struct {
	body        []byte
	contentType string
	etag        string
}

var proxyCache sync.Map

func ProxyImage(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.AccessToken == "" {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "服务端未配置访问令牌，请联系管理员"})
			return
		}
		if !proxyAuthorized(r, cfg) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "error": "未授权：缺少有效的访问凭证或媒体签名"})
			return
		}
		raw := strings.TrimSpace(r.URL.Query().Get("url"))
		if raw == "" {
			writeProxyText(w, http.StatusBadRequest, "Missing url parameter")
			return
		}
		if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
			if publicFileExists(cfg, raw) {
				http.Redirect(w, r, strings.SplitN(raw, "?", 2)[0], http.StatusFound)
				return
			}
			writeProxySVG(w, http.StatusNotFound, "非法本地路径")
			return
		}
		forceVideo := r.URL.Query().Get("as") == "video" || r.URL.Query().Get("type") == "video"
		isVideo := forceVideo || videoURLPattern.MatchString(raw) || videoHostPattern.MatchString(raw)
		imageURL := raw
		if !isVideo {
			imageURL = normalizeProxyURL(raw)
		}
		if strings.HasPrefix(imageURL, "//") {
			imageURL = "https:" + imageURL
		} else if strings.HasPrefix(imageURL, "http://") && httpUpgradeHost(imageURL) {
			imageURL = "https://" + strings.TrimPrefix(imageURL, "http://")
		}
		if !strings.HasPrefix(imageURL, "http://") && !strings.HasPrefix(imageURL, "https://") {
			writeProxySVG(w, http.StatusBadRequest, "不支持的地址")
			return
		}
		if cfg.Production() && strings.HasPrefix(imageURL, "http://") {
			writeProxySVG(w, http.StatusForbidden, "地址被安全策略拦截")
			return
		}
		parsed, err := url.Parse(imageURL)
		if err != nil || parsed.User != nil || !proxyHostAllowed(cfg, parsed.Hostname()) {
			writeProxySVG(w, http.StatusForbidden, "地址被安全策略拦截")
			return
		}
		if isVideo {
			proxyRemote(w, r, imageURL, true)
			return
		}
		width := proxyThumbWidth(r)
		cacheKey := imageURL
		if width > 0 {
			cacheKey = imageURL + "__thumb_" + strconv.Itoa(width)
		}
		if serveCachedProxy(w, r, cacheKey) {
			return
		}
		body, contentType, ok := cachedOrFetch(r, imageURL)
		if !ok {
			writeProxySVG(w, http.StatusBadGateway, "优质电商素材")
			return
		}
		if width > 0 {
			if resized, resizedType, resizedOK := resizeProxyThumb(body, width); resizedOK {
				body, contentType = resized, resizedType
			}
		}
		sum := sha256.Sum256(body)
		etag := `W/"` + hex.EncodeToString(sum[:8]) + `"`
		proxyCache.Store(cacheKey, proxyCacheEntry{body: body, contentType: contentType, etag: etag})
		writeProxyBytes(w, contentType, etag, body)
	})
}

func ClearProxyCache() int {
	count := 0
	proxyCache.Range(func(key, _ any) bool {
		proxyCache.Delete(key)
		count++
		return true
	})
	return count
}

func proxyAuthorized(r *http.Request, cfg config.Config) bool {
	if httpx.Authorized(r, cfg) {
		return true
	}
	exp, _ := strconv.ParseInt(r.URL.Query().Get("exp"), 10, 64)
	sig := strings.TrimSpace(r.URL.Query().Get("sig"))
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	return mediasign.Verify(raw, exp, sig, cfg.AccessToken) || mediasign.Verify("proxy-media-session", exp, sig, cfg.AccessToken)
}

func proxyRemote(w http.ResponseWriter, r *http.Request, rawURL string, video bool) {
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		writeProxySVG(w, http.StatusBadGateway, "商品素材保护中")
		return
	}
	for key, value := range upstreamHeaders(rawURL, video, r.Header.Get("Range")) {
		request.Header.Set(key, value)
	}
	response, err := network.SafeClient().Do(request)
	if err != nil {
		writeProxySVG(w, http.StatusBadGateway, "商品素材保护中")
		return
	}
	defer response.Body.Close()
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	if contentRange := response.Header.Get("Content-Range"); contentRange != "" {
		w.Header().Set("Content-Range", contentRange)
	}
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(response.Body, maxProxyBytes))
}

func fetchProxy(r *http.Request, rawURL string, video bool) ([]byte, string, bool) {
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", false
	}
	for key, value := range upstreamHeaders(rawURL, video, "") {
		request.Header.Set(key, value)
	}
	response, err := network.SafeClient().Do(request)
	if err != nil || response.StatusCode >= 400 {
		if response != nil {
			response.Body.Close()
		}
		return nil, "", false
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxProxyBytes+1))
	if err != nil || len(body) > maxProxyBytes || len(body) == 0 {
		return nil, "", false
	}
	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	return body, contentType, true
}

func writeProxyBytes(w http.ResponseWriter, contentType, etag string, body []byte) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
	w.Header().Set("Accept-Ranges", "bytes")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func writeProxyText(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(message))
}

func writeProxySVG(w http.ResponseWriter, status int, label string) {
	w.Header().Set("Content-Type", "image/svg+xml")
	if status == http.StatusBadGateway {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("X-Proxy-Fallback", "true")
	} else {
		w.Header().Set("Cache-Control", "no-store")
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(proxySVG(label)))
}

func publicFileExists(cfg config.Config, raw string) bool {
	clean := strings.SplitN(strings.SplitN(raw, "?", 2)[0], "#", 2)[0]
	rel := strings.TrimPrefix(clean, "/")
	roots := []string{filepath.Join(cfg.Root, "src/client/public")}
	if cfg.WebDistDir != "" {
		roots = append(roots, cfg.WebDistDir)
	}
	for _, root := range roots {
		target := filepath.Join(root, filepath.FromSlash(rel))
		back, err := filepath.Rel(root, target)
		if err != nil || back == ".." || strings.HasPrefix(back, ".."+string(os.PathSeparator)) {
			continue
		}
		info, err := os.Stat(target)
		if err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}

func httpUpgradeHost(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	for _, suffix := range []string{"360buyimg.com", "alicdn.com", "douyinpic.com", "xhscdn.com", "pddpic.com", "sinaimg.cn"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

func upstreamHeaders(rawURL string, video bool, rangeHeader string) map[string]string {
	headers := map[string]string{
		"User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
	}
	if video {
		headers["Accept"] = "*/*"
	} else {
		headers["Accept"] = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
	}
	if rangeHeader != "" {
		headers["Range"] = rangeHeader
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return headers
	}
	host := strings.ToLower(parsed.Hostname())
	rules := []struct{ suffix, referer string }{
		{"xhscdn.com", "https://www.xiaohongshu.com/"},
		{"xiaohongshu.com", "https://www.xiaohongshu.com/"},
		{"douyinpic.com", "https://www.douyin.com/"},
		{"snssdk.com", "https://www.douyin.com/"},
		{"bytecdn.cn", "https://www.douyin.com/"},
		{"360buyimg.com", "https://www.jd.com/"},
		{"jd.com", "https://www.jd.com/"},
		{"alicdn.com", "https://www.taobao.com/"},
		{"taobao.com", "https://www.taobao.com/"},
		{"tmall.com", "https://www.taobao.com/"},
		{"pddpic.com", "https://mobile.yangkeduo.com/"},
		{"yangkeduo.com", "https://mobile.yangkeduo.com/"},
		{"kuaishou.com", "https://www.kuaishou.com/"},
		{"yximgs.com", "https://www.kuaishou.com/"},
		{"kwimgs.com", "https://www.kuaishou.com/"},
	}
	for _, rule := range rules {
		if host == rule.suffix || strings.HasSuffix(host, "."+rule.suffix) {
			headers["Referer"] = rule.referer
			break
		}
	}
	return headers
}

func proxySVG(label string) string {
	return `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="100%" height="100%" fill="#F8FAFC"/><text x="50%" y="54%" font-size="13" fill="#64748B" text-anchor="middle">` + label + `</text></svg>`
}

func normalizeProxyURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "jfs/") {
		return "https://img10.360buyimg.com/pcpubliccms/s1440x1440_" + trimmed
	}
	return trimmed
}
