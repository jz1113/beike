package system

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/mediasign"
	"beike.local/cloud/src/backend/internal/platform/network"
)

const maxProxyBytes = 25 << 20

var videoURLPattern = regexp.MustCompile(`(?i)\.(mp4|mov|webm|avi|m4v)(\?|!|$)`)
var audioURLPattern = regexp.MustCompile(`(?i)\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)(\?|!|$)`)
var videoHostPattern = regexp.MustCompile(`(?i)video|snssdk\.com|bytecdn\.cn|yximgs|kwaicdn|kwimgs|kwai\.|kuaishou|douyinvod`)

var proxyCache = media.NewProxyCache(128<<20, 256, 15*time.Minute, 8)

var proxySuffixes struct {
	sync.Mutex
	root   string
	values []string
}

// PurgeExpiredProxyCache releases idle content from the API maintenance loop.
func PurgeExpiredProxyCache() { proxyCache.PurgeExpired() }

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
			if strings.HasPrefix(raw, "/storage/") || publicFileExists(cfg, raw) {
				http.Redirect(w, r, strings.SplitN(raw, "?", 2)[0], http.StatusFound)
				return
			}
			writeProxySVG(w, http.StatusNotFound, "非法本地路径")
			return
		}
		forceVideo := r.URL.Query().Get("as") == "video" || r.URL.Query().Get("type") == "video"
		forceAudio := r.URL.Query().Get("as") == "audio" || r.URL.Query().Get("type") == "audio"
		isVideo := forceVideo || videoURLPattern.MatchString(raw) || videoHostPattern.MatchString(raw)
		isMedia := isVideo || forceAudio || audioURLPattern.MatchString(raw)
		imageURL := raw
		if !isMedia {
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
		parsed, err := url.Parse(imageURL)
		if err == nil && parsed.User == nil && strings.HasPrefix(parsed.Path, "/storage/") {
			http.Redirect(w, r, strings.SplitN(parsed.Path, "?", 2)[0], http.StatusFound)
			return
		}
		if err == nil && (strings.Contains(parsed.Path, "/api/system/proxy-image") || strings.Contains(parsed.Path, "/api/system/proxy-video")) {
			innerURL := parsed.Query().Get("url")
			if innerURL != "" {
				http.Redirect(w, r, "/api/system/proxy-image?"+parsed.RawQuery, http.StatusFound)
				return
			}
		}
		if cfg.Production() && strings.HasPrefix(imageURL, "http://") {
			writeProxySVG(w, http.StatusForbidden, "地址被安全策略拦截")
			return
		}
		if err != nil || parsed.User != nil || !proxyHostAllowed(cfg, parsed.Hostname()) {
			writeProxySVG(w, http.StatusForbidden, "地址被安全策略拦截")
			return
		}
		if isMedia {
			proxyRemoteMedia(w, r, imageURL)
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
		body, contentType, err := cachedOrFetch(r, imageURL)
		if err != nil {
			writeProxyImageError(w, err)
			return
		}
		if width > 0 {
			if resized, resizedType, resizedOK := resizeProxyThumb(body, width); resizedOK {
				body, contentType = resized, resizedType
			}
		}
		sum := sha256.Sum256(body)
		etag := `W/"` + hex.EncodeToString(sum[:8]) + `"`
		proxyCache.Store(cacheKey, media.ProxyCacheEntry{Body: body, ContentType: contentType, ETag: etag})
		writeProxyBytes(w, contentType, etag, body)
	})
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

func fetchProxy(r *http.Request, rawURL string, video bool) ([]byte, string, error) {
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	for key, value := range upstreamHeaders(rawURL, video, "") {
		request.Header.Set(key, value)
	}
	response, err := network.SafeClient().Do(request)
	if err != nil {
		return nil, "", err
	}
	return readProxyImageResponse(response)
}

func readProxyImageResponse(response *http.Response) ([]byte, string, error) {
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return nil, "", proxyImageStatusError(response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxProxyBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > maxProxyBytes || len(body) == 0 {
		return nil, "", errors.New("invalid remote image size")
	}
	contentType := response.Header.Get("Content-Type")
	if contentType == "" || strings.EqualFold(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]), "application/octet-stream") {
		contentType = http.DetectContentType(body)
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		return nil, "", errors.New("remote response is not an image")
	}
	return body, contentType, nil
}

type proxyImageStatusError int

func (status proxyImageStatusError) Error() string {
	return fmt.Sprintf("remote image HTTP %d", status)
}

func writeProxyImageError(w http.ResponseWriter, err error) {
	status, message := http.StatusBadGateway, "远程图片暂时无法加载，请稍后重试"
	var upstream proxyImageStatusError
	if errors.As(err, &upstream) && (upstream == http.StatusNotFound || upstream == http.StatusGone) {
		status, message = int(upstream), "远程图片已不存在，请重新上传或生成"
	}
	// Error responses must not decode as images: img.onerror owns preview fallbacks.
	writeProxyText(w, status, message)
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
	accept := "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
	if video {
		accept = "*/*"
	}
	headers := media.RemoteMediaHeaders(rawURL, accept)
	if rangeHeader != "" {
		headers["Range"] = rangeHeader
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

func RemoteHostAllowed(cfg config.Config, host string) bool {
	return proxyHostAllowed(cfg, host)
}

func proxyHostAllowed(cfg config.Config, host string) bool {
	host = strings.ToLower(strings.Trim(strings.TrimSuffix(host, "."), "[]"))
	if host == "" {
		return false
	}
	if !cfg.Production() {
		if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" || strings.HasPrefix(host, "192.168.") || strings.HasPrefix(host, "10.") || strings.HasPrefix(host, "172.") {
			return true
		}
	}
	if network.PrivateIP(host) {
		return false
	}
	// Permit the exact result hosts published for Metaso H3 and Omni Flash.
	if host == "files.metaso.cn" || host == "oss-us.file-download.life" {
		return true
	}
	for _, suffix := range configuredProxyHosts() {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	for _, suffix := range loadProxySuffixes(cfg.Root) {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

func configuredProxyHosts() []string {
	hosts := []string{}
	for _, key := range []string{
		"S3_PUBLIC_DOMAIN", "S3_ENDPOINT", "R2_PUBLIC_DOMAIN",
		"AI_DRAWING_BASE_URL", "AI_DRAWING_API_BASE_URL", "AI_API_BASE", "AI_BASE_URL", "AI_GATEWAY_URL",
		"OPENAI_BASE_URL", "OPENAI_API_BASE",
		"ANTHROPIC_BASE_URL", "GEMINI_BASE_URL", "DEEPSEEK_BASE_URL",
		"MIDJOURNEY_BASE_URL", "COMFYUI_BASE_URL",
		"ONEAPI_BASE_URL", "NEWAPI_BASE_URL",
	} {
		raw := strings.TrimSpace(os.Getenv(key))
		if raw == "" {
			continue
		}
		raw = strings.TrimPrefix(strings.TrimPrefix(raw, "https://"), "http://")
		raw = strings.Split(raw, "/")[0]
		raw = strings.Split(raw, ":")[0]
		if raw != "" {
			hosts = append(hosts, strings.ToLower(raw))
		}
	}
	return hosts
}

func loadProxySuffixes(root string) []string {
	proxySuffixes.Lock()
	defer proxySuffixes.Unlock()
	if proxySuffixes.root == root && proxySuffixes.values != nil {
		return proxySuffixes.values
	}
	raw, err := os.ReadFile(filepath.Join(root, "src/shared/data/remote-host-suffixes.json"))
	payload := struct {
		Suffixes []string `json:"suffixes"`
	}{}
	if err == nil {
		_ = json.Unmarshal(raw, &payload)
	}
	proxySuffixes.root = root
	proxySuffixes.values = payload.Suffixes
	return payload.Suffixes
}

func proxyThumbWidth(r *http.Request) int {
	thumb := r.URL.Query().Get("thumb") == "1" || r.URL.Query().Get("thumb") == "true"
	raw := r.URL.Query().Get("w")
	if raw == "" {
		if thumb {
			return 640
		}
		return 0
	}
	width, err := strconv.Atoi(raw)
	if err != nil {
		width = 640
	}
	if width < 80 {
		return 80
	}
	if width > 1920 {
		return 1920
	}
	return width
}

func serveCachedProxy(w http.ResponseWriter, r *http.Request, key string) bool {
	cached, ok := proxyCache.Load(key)
	if !ok {
		return false
	}
	entry := cached
	if r.Header.Get("If-None-Match") == entry.ETag {
		w.Header().Set("ETag", entry.ETag)
		w.Header().Set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	writeProxyBytes(w, entry.ContentType, entry.ETag, entry.Body)
	return true
}

func cachedOrFetch(r *http.Request, imageURL string) ([]byte, string, error) {
	return proxyCache.FetchWithError(r.Context(), imageURL, func() ([]byte, string, error) {
		return fetchProxy(r, imageURL, false)
	})
}

func resizeProxyThumb(body []byte, width int) ([]byte, string, bool) {
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, "", false
	}
	bounds := img.Bounds()
	if bounds.Dx() <= width {
		return nil, "", false
	}
	height := bounds.Dy() * width / bounds.Dx()
	if height < 1 {
		height = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	scaleNearest(dst, img)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, dst, &jpeg.Options{Quality: 82}); err != nil {
		return nil, "", false
	}
	return encoded.Bytes(), "image/jpeg", true
}

func scaleNearest(dst *image.RGBA, src image.Image) {
	bounds := dst.Bounds()
	source := src.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		sy := source.Min.Y + (y-bounds.Min.Y)*source.Dy()/bounds.Dy()
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			sx := source.Min.X + (x-bounds.Min.X)*source.Dx()/bounds.Dx()
			dst.Set(x, y, src.At(sx, sy))
		}
	}
}
