package system

import (
	"errors"
	"io"
	"net/http"
	"net/url"
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
		target, status, message := normalizeVideoProxyURL(cfg, strings.TrimSpace(r.URL.Query().Get("url")))
		if status != 0 {
			writeProxyText(w, status, message)
			return
		}
		request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
		if err != nil {
			writeProxyText(w, http.StatusBadRequest, "不支持的地址")
			return
		}
		for key, value := range upstreamHeaders(target, true, "") {
			request.Header.Set(key, value)
		}
		response, err := network.SafeClient().Do(request)
		if err != nil {
			if response != nil {
				response.Body.Close()
			}
			writeProxyText(w, http.StatusBadGateway, "视频下载失败")
			return
		}
		serveProxiedVideo(w, response)
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

func serveProxiedVideo(w http.ResponseWriter, response *http.Response) {
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		writeProxyText(w, http.StatusBadGateway, "视频下载失败")
		return
	}
	if response.ContentLength == 0 {
		writeProxyText(w, http.StatusBadGateway, "视频内容为空")
		return
	}
	if response.ContentLength > maxVideoProxyBytes {
		writeProxyText(w, http.StatusRequestEntityTooLarge, "视频超过 200MB")
		return
	}
	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "video/mp4"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	if response.ContentLength > 0 {
		w.Header().Set("Content-Length", response.Header.Get("Content-Length"))
	}
	w.WriteHeader(http.StatusOK)
	written, err := copyCapped(w, response.Body, maxVideoProxyBytes)
	if err != nil || written == 0 {
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
		}
		if err == io.EOF {
			return written, nil
		}
		if err != nil {
			return written, err
		}
	}
}
