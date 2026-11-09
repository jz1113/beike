package system

import (
	"bytes"
	"errors"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestResizeProxyThumbShrinksWidePNG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 200, 100))
	var raw bytes.Buffer
	if err := png.Encode(&raw, img); err != nil {
		t.Fatal(err)
	}
	resized, contentType, ok := resizeProxyThumb(raw.Bytes(), 80)
	if !ok || contentType != "image/jpeg" || len(resized) == 0 {
		t.Fatalf("thumb ok=%v type=%s len=%d", ok, contentType, len(resized))
	}
	decoded, _, err := image.Decode(bytes.NewReader(resized))
	if err != nil || decoded.Bounds().Dx() != 80 {
		t.Fatalf("width %v %v", decoded, err)
	}
}

func TestProxyImageRequiresURLAndAllowlist(t *testing.T) {
	cfg := config.Config{AccessToken: "secret", Root: repoRoot(t)}
	handler := ProxyImage(cfg)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/system/proxy-image", nil)
	request.Header.Set("x-app-token", "secret")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || response.Body.String() != "Missing url parameter" {
		t.Fatalf("missing %d %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodGet, "/api/system/proxy-image?url=https://evil.example/a.jpg", nil)
	request.Header.Set("x-app-token", "secret")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || response.Header().Get("Content-Type") != "image/svg+xml" {
		t.Fatalf("blocked %d %s", response.Code, response.Header().Get("Content-Type"))
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/proxy-image?url=https://img.alicdn.com/a.jpg", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("auth %d", response.Code)
	}
}

func TestProxyImageAllowsAnyRoutesHost(t *testing.T) {
	cfg := config.Config{AccessToken: "secret", Root: repoRoot(t)}
	if !proxyHostAllowed(cfg, "files.anyroutes.cn") {
		t.Fatal("expected files.anyroutes.cn to be allowed by allowlist")
	}
	if !proxyHostAllowed(cfg, "cdn.anyroutes.com") {
		t.Fatal("expected cdn.anyroutes.com to be allowed by allowlist")
	}
}

func TestProxyImageMissingRemoteDoesNotDecodeAsPlaceholder(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusGone, http.StatusServiceUnavailable} {
		upstream := &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader("upstream error")), Header: make(http.Header)}
		_, _, err := readProxyImageResponse(upstream)
		if err == nil {
			t.Fatal("upstream failure accepted as an image")
		}
		response := httptest.NewRecorder()
		writeProxyImageError(response, err)
		want := status
		if status == http.StatusServiceUnavailable {
			want = http.StatusBadGateway
		}
		if response.Code != want || strings.HasPrefix(response.Header().Get("Content-Type"), "image/") || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("status=%d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
		}
	}
}

func TestProxyImageRejectsSuccessfulHTMLAndEmptyResponses(t *testing.T) {
	for _, body := range []string{"<html>not an image</html>", ""} {
		upstream := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{"Content-Type": {"text/html"}}}
		if _, _, err := readProxyImageResponse(upstream); err == nil {
			t.Fatal("invalid image response accepted")
		}
	}
	response := httptest.NewRecorder()
	writeProxyImageError(response, errors.New("network unavailable"))
	if response.Code != http.StatusBadGateway {
		t.Fatalf("network error: %d", response.Code)
	}
}

func TestProxyImageStillAcceptsValidImage(t *testing.T) {
	var raw bytes.Buffer
	if err := png.Encode(&raw, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	for _, declared := range []string{"", "application/octet-stream", "image/png"} {
		upstream := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(raw.Bytes())), Header: http.Header{"Content-Type": {declared}}}
		body, contentType, err := readProxyImageResponse(upstream)
		if err != nil || contentType != "image/png" || !bytes.Equal(body, raw.Bytes()) {
			t.Fatalf("valid image: %s %v", contentType, err)
		}
	}
}
