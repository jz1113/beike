package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestCopywritingLocalFallback(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := Copywriting(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"翡翠手镯"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"fromFallback":true`) || !strings.Contains(response.Body.String(), "原图直出关于这只翡翠手镯的真实体验") {
		t.Fatalf("fallback %d %s", response.Code, response.Body.String())
	}
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"翡翠手镯","existingTitles":["原图直出关于这只翡翠手镯的真实体验"]}`)))
	if !strings.Contains(duplicate.Body.String(), "真实自用分享关于翡翠手镯") {
		t.Fatalf("duplicate %s", duplicate.Body.String())
	}
}

func TestCopywritingWithKeyUsesModel(t *testing.T) {
	var seenAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"title\":\"台灯做工超出预期\",\"content\":\"收到后连续用了两周，原图直出，没有滤镜。\\n\\n灯罩边缘打磨整齐，开关手感清楚，桌面反光也比较自然。晚上阅读时光线铺得开，不刺眼。\\n\\n按正常桌面高度摆放就好，清洁时避开插座进水。\",\"tags\":[\"#台灯\"]}"}}]}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Copywriting(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"台灯","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "fromFallback") || !strings.Contains(response.Body.String(), "台灯做工超出预期") || seenAuth != "Bearer secret" {
		t.Fatalf("model %d auth %s body %s", response.Code, seenAuth, response.Body.String())
	}
}
