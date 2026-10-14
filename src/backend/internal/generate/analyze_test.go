package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAnalyzeRequiresVisionKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := Analyze(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"shotCount":4}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "未配置 AI 视觉大模型接口密钥") {
		t.Fatalf("key %d %s", response.Code, response.Body.String())
	}
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"model":"deepseek-official:unknown"}`)))
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), "此 DeepSeek 官方模型尚未适配") {
		t.Fatalf("deepseek %d %s", unknown.Code, unknown.Body.String())
	}
}

func TestAnalyzeRejectsShotCount(t *testing.T) {
	handler := Analyze(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"shotCount":0}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "shotCount: Number must be greater than or equal to 1") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	title := httptest.NewRecorder()
	handler.ServeHTTP(title, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"productTitle":"`+strings.Repeat("题", 501)+`","shotCount":0}`)))
	if title.Code != http.StatusBadRequest || !strings.Contains(title.Body.String(), "productTitle: String must contain at most 500 character(s)") {
		t.Fatalf("title %d %s", title.Code, title.Body.String())
	}
	urls := make([]string, 25)
	for i := range urls {
		urls[i] = "x"
	}
	raw, _ := json.Marshal(map[string]any{"imageUrls": urls})
	images := httptest.NewRecorder()
	handler.ServeHTTP(images, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(string(raw))))
	if images.Code != http.StatusBadRequest || !strings.Contains(images.Body.String(), "imageUrls: Array must contain at most 24 element(s)") {
		t.Fatalf("images %d %s", images.Code, images.Body.String())
	}
}

func TestAnalyzeReturnsStoryboard(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"productFingerprint\":\"台灯\",\"productRole\":\"主体\",\"masterScene\":\"书桌\",\"prompts\":[{\"shot\":1,\"prompt\":\"近景\"}]}"}}]}`))
	}))
	defer server.Close()
	previous := modelHTTP
	modelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { modelHTTP = previous })
	handler := Analyze(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"productTitle":"台灯","shotCount":1,"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"productFingerprint":"台灯"`) || !strings.Contains(response.Body.String(), `"prompt":"近景"`) {
		t.Fatalf("analyze %d %s", response.Code, response.Body.String())
	}
}
