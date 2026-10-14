package assistant

import (
	"bytes"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAssistantVideoMedia(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	handler := Media(config.Config{Upstream: "http://127.0.0.1:1"})
	webm := append([]byte{0x1A, 0x45, 0xDF, 0xA3}, []byte("rest")...)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader(string(webm)))
	request.Header.Set("Content-Type", "video/webm")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "/storage/local/assistant-attachments/") || !strings.Contains(response.Body.String(), ".webm") {
		t.Fatalf("save %d %s", response.Code, response.Body.String())
	}
	unsupported := httptest.NewRecorder()
	badType := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader("video"))
	badType.Header.Set("Content-Type", "video/avi")
	handler.ServeHTTP(unsupported, badType)
	if unsupported.Code != http.StatusUnsupportedMediaType || !strings.Contains(unsupported.Body.String(), "目前支持 MP4、MOV 和 WebM 视频") {
		t.Fatalf("type %d %s", unsupported.Code, unsupported.Body.String())
	}
	mismatch := httptest.NewRecorder()
	badBody := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader(strings.Repeat("0", 12)))
	badBody.Header.Set("Content-Type", "video/mp4")
	handler.ServeHTTP(mismatch, badBody)
	if mismatch.Code != http.StatusBadRequest || !strings.Contains(mismatch.Body.String(), "视频内容与文件格式不匹配") {
		t.Fatalf("header %d %s", mismatch.Code, mismatch.Body.String())
	}
	_ = os.RemoveAll(os.Getenv("AZHUO_CACHE_DIR"))
}

func TestAssistantImageMedia(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	handler := Media(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/media", &encoded)
	request.Header.Set("Content-Type", "image/png")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), ".jpg") {
		t.Fatalf("image %d %s", response.Code, response.Body.String())
	}
}
