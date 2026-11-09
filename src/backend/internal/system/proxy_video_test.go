package system

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/mediasign"
)

func TestProxyVideoRequiresURLAndAllowlist(t *testing.T) {
	cfg := config.Config{AccessToken: "secret", Root: repoRoot(t)}
	handler := ProxyVideo(cfg)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/system/proxy-video", nil)
	request.Header.Set("x-app-token", "secret")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || response.Body.String() != "Missing url parameter" {
		t.Fatalf("missing %d %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/api/system/proxy-video?url=https://evil.example/a.mp4", nil)
	request.Header.Set("x-app-token", "secret")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("blocked %d", response.Code)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/proxy-video?url=https://xceshi.oss-cn-beijing.aliyuncs.com/a.mp4", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("auth %d", response.Code)
	}
}

func TestServeProxiedVideoRejectsOversize(t *testing.T) {
	response := httptest.NewRecorder()
	upstream := &http.Response{
		StatusCode:    http.StatusOK,
		ContentLength: maxVideoProxyBytes + 1,
		Header:        make(http.Header),
		Body:          io.NopCloser(strings.NewReader("too-big")),
	}
	serveProxiedVideo(response, httptest.NewRequest(http.MethodGet, "/", nil), upstream)
	if response.Code != http.StatusRequestEntityTooLarge || !strings.Contains(response.Body.String(), "200MB") {
		t.Fatalf("oversize %d %s", response.Code, response.Body.String())
	}
}

func TestCopyCappedStopsBeforeOverflow(t *testing.T) {
	var exact bytes.Buffer
	n, err := copyCapped(&exact, strings.NewReader("0123456789"), 10)
	if err != nil || n != 10 || exact.String() != "0123456789" {
		t.Fatalf("exact n=%d err=%v body=%s", n, err, exact.String())
	}
	var overflow bytes.Buffer
	n, err = copyCapped(&overflow, strings.NewReader("0123456789x"), 10)
	if !errors.Is(err, errVideoTooLarge) || n != 10 || overflow.String() != "0123456789" {
		t.Fatalf("overflow n=%d err=%v body=%s", n, err, overflow.String())
	}
}

func TestServeProxiedVideoPreservesRangeResponse(t *testing.T) {
	response := httptest.NewRecorder()
	upstream := &http.Response{
		StatusCode:    http.StatusPartialContent,
		ContentLength: 4,
		Header: http.Header{
			"Content-Type":  []string{"video/mp4"},
			"Content-Range": []string{"bytes 100-103/1000"},
			"Accept-Ranges": []string{"bytes"},
			"Etag":          []string{`"version-1"`},
		},
		Body: io.NopCloser(strings.NewReader("tail")),
	}
	serveProxiedVideo(response, httptest.NewRequest(http.MethodGet, "/", nil), upstream)
	if response.Code != http.StatusPartialContent || response.Header().Get("Content-Range") != "bytes 100-103/1000" || response.Header().Get("Content-Length") != "4" || response.Body.String() != "tail" {
		t.Fatalf("range response: status=%d headers=%v body=%q", response.Code, response.Header(), response.Body.String())
	}
	if response.Header().Get("Accept-Ranges") != "bytes" || response.Header().Get("ETag") != `"version-1"` {
		t.Fatalf("range validators missing: %v", response.Header())
	}
}

func TestServeProxiedVideoPreservesUnsatisfiedRange(t *testing.T) {
	response := httptest.NewRecorder()
	upstream := &http.Response{StatusCode: http.StatusRequestedRangeNotSatisfiable,
		Header: http.Header{"Content-Range": []string{"bytes */1000"}}, Body: io.NopCloser(strings.NewReader(""))}
	serveProxiedVideo(response, httptest.NewRequest(http.MethodGet, "/", nil), upstream)
	if response.Code != http.StatusRequestedRangeNotSatisfiable || response.Header().Get("Content-Range") != "bytes */1000" {
		t.Fatalf("unsatisfied range: status=%d headers=%v", response.Code, response.Header())
	}
}

func TestServeProxiedVideoRejectsPartialResponseWithoutRange(t *testing.T) {
	response := httptest.NewRecorder()
	upstream := &http.Response{StatusCode: http.StatusPartialContent, ContentLength: 4,
		Header: make(http.Header), Body: io.NopCloser(strings.NewReader("tail"))}
	serveProxiedVideo(response, httptest.NewRequest(http.MethodGet, "/", nil), upstream)
	if response.Code != http.StatusBadGateway {
		t.Fatalf("invalid partial response accepted: %d", response.Code)
	}
}

func TestServeProxiedMediaInfersAudioTypeAndSkipsHeadBody(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			response := httptest.NewRecorder()
			upstream := &http.Response{StatusCode: http.StatusOK, ContentLength: 5,
				Header: http.Header{"Content-Type": []string{"application/octet-stream"}}, Body: io.NopCloser(strings.NewReader("audio"))}
			request := httptest.NewRequest(method, "/api/system/proxy-image?url=https://cdn.example/sample.mp3&as=audio", nil)
			serveProxiedVideo(response, request, upstream)
			if response.Code != http.StatusOK || response.Header().Get("Content-Length") != "5" || response.Header().Get("Content-Type") != "audio/mpeg" {
				t.Fatalf("audio headers: status=%d headers=%v", response.Code, response.Header())
			}
			if method == http.MethodHead && response.Body.Len() != 0 {
				t.Fatalf("HEAD returned body: %q", response.Body.String())
			}
		})
	}
}

func TestServeProxiedVideoDoesNotTruncateAtImageLimit(t *testing.T) {
	body := bytes.Repeat([]byte("v"), maxProxyBytes+1024)
	response := httptest.NewRecorder()
	upstream := &http.Response{StatusCode: http.StatusOK, ContentLength: int64(len(body)),
		Header: http.Header{"Content-Type": []string{"video/mp4"}}, Body: io.NopCloser(bytes.NewReader(body))}
	serveProxiedVideo(response, httptest.NewRequest(http.MethodGet, "/", nil), upstream)
	if response.Code != http.StatusOK || response.Body.Len() != len(body) {
		t.Fatalf("large video truncated: status=%d bytes=%d want=%d", response.Code, response.Body.Len(), len(body))
	}
}

func TestServeProxiedVideoAbortsTruncatedStream(t *testing.T) {
	defer func() {
		if value := recover(); value != http.ErrAbortHandler {
			t.Fatalf("expected aborted truncated stream, got %v", value)
		}
	}()
	upstream := &http.Response{StatusCode: http.StatusOK, ContentLength: 10,
		Header: http.Header{"Content-Type": []string{"video/mp4"}}, Body: io.NopCloser(strings.NewReader("short"))}
	serveProxiedVideo(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil), upstream)
}

func TestServeProxiedVideoPreservesUnavailableMediaStatus(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusGone} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			response := httptest.NewRecorder()
			upstream := &http.Response{StatusCode: status, Header: make(http.Header),
				Body: io.NopCloser(strings.NewReader("upstream-private-diagnostics"))}
			serveProxiedVideo(response, httptest.NewRequest(http.MethodGet, "/", nil), upstream)
			if response.Code != status || strings.Contains(response.Body.String(), "upstream-private-diagnostics") {
				t.Fatalf("media failure: status=%d body=%q", response.Code, response.Body.String())
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("media error must not be cached: %v", response.Header())
			}
		})
	}
}

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
