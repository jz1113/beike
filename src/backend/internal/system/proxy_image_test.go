package system

import (
	"bytes"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
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
