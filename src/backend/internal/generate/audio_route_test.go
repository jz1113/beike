package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAudioValidationAndSubmission(t *testing.T) {
	handler := Audio(config.Config{NodeEnv: "production", Upstream: "http://127.0.0.1:1"})

	emptyReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"  "}`))
	emptyResp := httptest.NewRecorder()
	handler.ServeHTTP(emptyResp, emptyReq)
	if emptyResp.Code != http.StatusBadRequest || !strings.Contains(emptyResp.Body.String(), "音频生成文本不能为空") {
		t.Fatalf("expected 400 for empty prompt, got %d: %s", emptyResp.Code, emptyResp.Body.String())
	}

	missingReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"欢迎使用贝壳云图音频生成","model":"speech-2.8-hd","format":"mp3"}`))
	missingResp := httptest.NewRecorder()
	handler.ServeHTTP(missingResp, missingReq)
	if missingResp.Code != http.StatusBadRequest || !strings.Contains(missingResp.Body.String(), "未配置音频接口") {
		t.Fatalf("expected 400 without gateway, got %d: %s", missingResp.Code, missingResp.Body.String())
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/t2a_v2" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("ID3fake-audio"))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler = Audio(config.Config{NodeEnv: "production", Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t)})
	validReq := httptest.NewRequest(http.MethodPost, "/api/generate/audio", strings.NewReader(`{"prompt":"欢迎使用贝壳云图音频生成","model":"speech-2.8-hd","format":"mp3","customBaseUrl":"`+server.URL+`","customApiKey":"secret"}`))
	validResp := httptest.NewRecorder()
	handler.ServeHTTP(validResp, validReq)
	if validResp.Code != http.StatusOK || !strings.Contains(validResp.Body.String(), `"success":true`) || !strings.Contains(validResp.Body.String(), "/storage/") {
		t.Fatalf("expected saved audio, got %d: %s", validResp.Code, validResp.Body.String())
	}

	// 3. GET 缺少参数
	missingPollReq := httptest.NewRequest(http.MethodGet, "/api/generate/audio", nil)
	missingPollResp := httptest.NewRecorder()
	handler.ServeHTTP(missingPollResp, missingPollReq)
	if missingPollResp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing poll params, got %d", missingPollResp.Code)
	}
}
