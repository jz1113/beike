package depth

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestDepthImageFormChecksFile(t *testing.T) {
	cfg := config.Config{Upstream: "http://127.0.0.1:1"}
	missing := httptest.NewRecorder()
	depthImageForm(cfg, missing, depthImageRequest(t, "note", "a.png", "image/png", []byte("png")))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "缺少图片文件 image") {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
	kind := httptest.NewRecorder()
	depthImageForm(cfg, kind, depthImageRequest(t, "image", "notes.txt", "text/plain", []byte("hello")))
	if kind.Code != http.StatusBadRequest || !strings.Contains(kind.Body.String(), "请上传 JPG / PNG / WebP 图片文件") {
		t.Fatalf("kind %d %s", kind.Code, kind.Body.String())
	}
	accepted := httptest.NewRecorder()
	depthImageForm(cfg, accepted, depthImageRequest(t, "image", "shot.png", "application/octet-stream", []byte("png")))
	if accepted.Code == http.StatusBadRequest {
		t.Fatalf("png was rejected: %s", accepted.Body.String())
	}
}

func depthImageRequest(t *testing.T, field, name, contentType string, payload []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="` + field + `"; filename="` + name + `"`},
		"Content-Type":        {contentType},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/generate/depth-image", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestDepthImageReceiptDoesNotProxy(t *testing.T) {
	handler := DepthImage(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/generate/depth-image", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "任务标识无效") {
		t.Fatalf("receipt %d %s", response.Code, response.Body.String())
	}
}

func TestDepthImageRejectsMissingModel(t *testing.T) {
	handler := DepthImage(config.Config{Root: t.TempDir(), Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/depth-image", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
