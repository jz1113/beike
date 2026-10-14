package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestCanvasTextBlocksUnsafeGateway(t *testing.T) {
	handler := CanvasText(config.Config{NodeEnv: "production", Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"写一句","customBaseUrl":"http://127.0.0.1/v1"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "密钥未发送到其他网关") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestCanvasTextReadsChatCompletion(t *testing.T) {
	var seenAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"  正文  "}}]}`))
	}))
	defer server.Close()
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasHTTP = previous })
	handler := CanvasText(config.Config{Upstream: "http://127.0.0.1:1"})
	request := httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"写一句","customBaseUrl":"`+server.URL+`","customApiKey":"secret"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"text":"正文"`) || seenAuth != "Bearer secret" {
		t.Fatalf("status %d auth %s body %s", response.Code, seenAuth, response.Body.String())
	}
}

func TestCanvasTextRejectsEmptyPrompt(t *testing.T) {
	handler := CanvasText(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"  "}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "最多 20000 字") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestCanvasTextReadsResponsesAPI(t *testing.T) {
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write([]byte(`{"output_text":"响应正文"}`))
	}))
	defer server.Close()
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasHTTP = previous })
	handler := CanvasText(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"写一句","apiFormat":"openai-responses","customBaseUrl":"`+server.URL+`","customApiKey":"secret"}`)))
	if response.Code != http.StatusOK || path != "/v1/responses" || !strings.Contains(response.Body.String(), `"text":"响应正文"`) {
		t.Fatalf("status %d path %s body %s", response.Code, path, response.Body.String())
	}
}
