package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func Proxy(upstream string) http.Handler {
	target, err := url.Parse(upstream)
	if err != nil {
		return failedProxy()
	}
	proxy := &httputil.ReverseProxy{
		Rewrite: func(request *httputil.ProxyRequest) {
			request.SetURL(target)
			request.SetXForwarded()
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
			writeProxyError(w)
		},
	}
	return proxy
}

func failedProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeProxyError(w)
	})
}

func writeProxyError(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusBadGateway)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false,
		"error":   "上游 API 未就绪",
		"code":    "upstream_unavailable",
	})
}
