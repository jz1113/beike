package system

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/mediasign"
)

func TestMetasoVideoProxyAllowsOnlyExactOutputHost(t *testing.T) {
	cfg := config.Config{NodeEnv: "production", AccessToken: "test-only", Root: repoRoot(t)}
	const resultURL = "https://files.metaso.cn/minimax/result.mp4?Expires=2000000000&Signature=a%2Bb%2Fc%3D&part=1"
	for _, raw := range []string{resultURL, "https://FILES.METASO.CN/minimax/result.mp4", "https://files.metaso.cn./minimax/result.mp4"} {
		target, status, message := normalizeVideoProxyURL(cfg, raw)
		if status != 0 || message != "" || target != raw {
			t.Fatalf("valid Metaso output was blocked or rewritten: status=%d message=%q", status, message)
		}
	}
	for _, raw := range []string{
		"https://metaso.cn/result.mp4",
		"https://api.metaso.cn/result.mp4",
		"https://nested.files.metaso.cn/result.mp4",
		"https://evilfiles.metaso.cn/result.mp4",
		"https://files.metaso.cn.evil.example/result.mp4",
		"https://files.metaso.cn@evil.example/result.mp4",
		"https://user:password@files.metaso.cn/result.mp4",
		"http://files.metaso.cn/result.mp4",
		"https://127.0.0.1/result.mp4",
		"https://169.254.169.254/result.mp4",
	} {
		_, status, _ := normalizeVideoProxyURL(cfg, raw)
		if status != http.StatusForbidden {
			t.Fatalf("unsafe or unrelated address escaped host policy: status=%d host=%s", status, raw)
		}
	}
}

func TestMetasoVideoProxyStillRequiresReadAuthorization(t *testing.T) {
	cfg := config.Config{NodeEnv: "production", AccessToken: "test-only", Root: repoRoot(t)}
	const resultURL = "https://files.metaso.cn/minimax/result.mp4?Signature=a%2Bb%2Fc%3D"
	for name, handler := range map[string]http.Handler{"proxy-video": ProxyVideo(cfg), "proxy-image": ProxyImage(cfg)} {
		for _, method := range []string{http.MethodGet, http.MethodHead} {
			t.Run(name+"/"+method, func(t *testing.T) {
				path := "/api/system/" + name + "?url=" + url.QueryEscape(resultURL) + "&as=video"
				request := httptest.NewRequest(method, path, nil)
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusUnauthorized {
					t.Fatalf("allowlisted host bypassed read authorization: %d", response.Code)
				}
				signature := mediasign.Create("proxy-media-session", cfg.AccessToken, 3600)
				query := request.URL.Query()
				query.Set("exp", strconv.FormatInt(signature.Exp, 10))
				query.Set("sig", signature.Sig)
				request.URL.RawQuery = query.Encode()
				if request.URL.Query().Get("url") != resultURL || !proxyAuthorized(request, cfg) {
					t.Fatal("media session did not authorize the original signed result URL")
				}
				query.Set("sig", "invalid-signature")
				request.URL.RawQuery = query.Encode()
				if proxyAuthorized(request, cfg) {
					t.Fatal("invalid media signature authorized the result")
				}
			})
		}
	}
}
