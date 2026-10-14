package system

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
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
	serveProxiedVideo(response, upstream)
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
