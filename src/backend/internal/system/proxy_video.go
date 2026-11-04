package system

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
)

const maxVideoProxyBytes int64 = 200 << 20

var errVideoTooLarge = errors.New("video exceeds limit")

func ProxyVideo(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.AccessToken == "" {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "服务端未配置访问令牌，请联系管理员"})
			return
		}
		if !proxyAuthorized(r, cfg) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "error": "未授权：缺少有效的访问凭证或媒体签名"})
			return
		}
		rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
		if strings.HasPrefix(rawURL, "/storage/") {
			http.Redirect(w, r, strings.SplitN(rawURL, "?", 2)[0], http.StatusFound)
			return
		}
		if parsed, err := url.Parse(rawURL); err == nil && parsed.User == nil && strings.HasPrefix(parsed.Path, "/storage/") {
			http.Redirect(w, r, strings.SplitN(parsed.Path, "?", 2)[0], http.StatusFound)
			return
		}
		target, status, message := normalizeVideoProxyURL(cfg, rawURL)
		if status != 0 {
			writeProxyText(w, status, message)
			return
		}
		proxyRemoteMedia(w, r, target)
	})
}

func normalizeVideoProxyURL(cfg config.Config, raw string) (string, int, string) {
	if raw == "" {
		return "", http.StatusBadRequest, "Missing url parameter"
	}
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		return "", http.StatusBadRequest, "不支持的地址"
	}
	if strings.HasPrefix(raw, "//") {
		raw = "https:" + raw
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return "", http.StatusBadRequest, "不支持的地址"
	}
	if cfg.Production() && strings.HasPrefix(raw, "http://") {
		return "", http.StatusForbidden, "地址被安全策略拦截"
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || !proxyHostAllowed(cfg, parsed.Hostname()) {
		return "", http.StatusForbidden, "地址被安全策略拦截"
	}
	return raw, 0, ""
}

// Both proxy URLs must preserve byte ranges: media metadata can live at the
// end of the file, and browsers fetch it separately before showing a frame.
func proxyRemoteMedia(w http.ResponseWriter, r *http.Request, target string) {
	method := http.MethodGet
	if r.Method == http.MethodHead {
		method = http.MethodHead
	}
	request, err := http.NewRequestWithContext(r.Context(), method, target, nil)
	if err != nil {
		writeProxyText(w, http.StatusBadRequest, "不支持的地址")
		return
	}
	for key, value := range upstreamHeaders(target, true, r.Header.Get("Range")) {
		request.Header.Set(key, value)
	}
	request.Header.Set("Accept-Encoding", "identity")
	if value := r.Header.Get("If-Range"); value != "" {
		request.Header.Set("If-Range", value)
	}
	response, err := network.SafeClient().Do(request)
	if err != nil {
		if response != nil {
			response.Body.Close()
		}
		writeProxyText(w, http.StatusBadGateway, "媒体加载失败")
		return
	}
	serveProxiedVideo(w, r, response)
}

func serveProxiedVideo(w http.ResponseWriter, r *http.Request, response *http.Response) {
	defer response.Body.Close()
	if response.StatusCode == http.StatusRequestedRangeNotSatisfiable {
		if value := response.Header.Get("Content-Range"); value != "" {
			w.Header().Set("Content-Range", value)
		}
		writeProxyText(w, http.StatusRequestedRangeNotSatisfiable, "请求的媒体范围无效")
		return
	}
	switch response.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		writeProxyText(w, response.StatusCode, "媒体访问被拒绝，请检查素材地址或授权")
		return
	case http.StatusNotFound, http.StatusGone:
		writeProxyText(w, response.StatusCode, "媒体地址已失效或文件已不存在")
		return
	}
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusPartialContent {
		writeProxyText(w, http.StatusBadGateway, "媒体加载失败")
		return
	}
	if response.ContentLength == 0 {
		writeProxyText(w, http.StatusBadGateway, "媒体内容为空")
		return
	}
	if response.ContentLength > maxVideoProxyBytes {
		writeProxyText(w, http.StatusRequestEntityTooLarge, "媒体超过 200MB")
		return
	}
	if response.StatusCode == http.StatusPartialContent && response.Header.Get("Content-Range") == "" {
		writeProxyText(w, http.StatusBadGateway, "媒体响应缺少范围信息")
		return
	}
	contentType := response.Header.Get("Content-Type")
	if contentType == "" || contentType == "application/octet-stream" {
		target, _ := url.Parse(r.URL.Query().Get("url"))
		if target != nil {
			contentType = mime.TypeByExtension(strings.ToLower(path.Ext(target.Path)))
		}
		if contentType == "" {
			contentType = "video/mp4"
			if r.URL.Query().Get("as") == "audio" {
				contentType = "audio/mpeg"
			}
		}
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	for _, key := range []string{"Accept-Ranges", "Content-Range", "ETag", "Last-Modified"} {
		if value := response.Header.Get(key); value != "" {
			w.Header().Set(key, value)
		}
	}
	if response.ContentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(response.ContentLength, 10))
	}
	w.WriteHeader(response.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	written, err := copyCapped(w, response.Body, maxVideoProxyBytes)
	if err != nil || written == 0 || (response.ContentLength >= 0 && written != response.ContentLength) {
		// A truncated stream must fail rather than be cached as a complete file.
		panic(http.ErrAbortHandler)
	}
}

func copyCapped(dst io.Writer, src io.Reader, limit int64) (int64, error) {
	buf := make([]byte, 32*1024)
	var written int64
	for {
		remain := limit - written
		if remain <= 0 {
			var peek [1]byte
			n, err := src.Read(peek[:])
			if n > 0 {
				return written, errVideoTooLarge
			}
			if err == io.EOF {
				return written, nil
			}
			if err != nil {
				return written, err
			}
			continue
		}
		toRead := int64(len(buf))
		if remain < toRead {
			toRead = remain
		}
		n, err := src.Read(buf[:toRead])
		if n > 0 {
			nw, werr := dst.Write(buf[:n])
			written += int64(nw)
			if werr != nil {
				return written, werr
			}
			if nw != n {
				return written, io.ErrShortWrite
			}
		}
		if err == io.EOF {
			return written, nil
		}
		if err != nil {
			return written, err
		}
	}
}
