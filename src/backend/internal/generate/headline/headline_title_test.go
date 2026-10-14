package headline

import (
	"beike.local/cloud/src/backend/internal/generate"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestHeadlineTitleSchemaAndKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := HeadlineTitle(config.Config{Upstream: "http://127.0.0.1:1"})
	tooMany := httptest.NewRecorder()
	handler.ServeHTTP(tooMany, httptest.NewRequest(http.MethodPost, "/api/generate/headline-title", strings.NewReader(`{"originalTitle":"台灯测评","imageUrls":["https://img.alicdn.com/a.jpg","https://img.alicdn.com/b.jpg"]}`)))
	if tooMany.Code != http.StatusBadRequest || !strings.Contains(tooMany.Body.String(), "imageUrls: 标题改写只使用一张商品图片") {
		t.Fatalf("count %d %s", tooMany.Code, tooMany.Body.String())
	}
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/generate/headline-title", strings.NewReader(`{"originalTitle":"台灯测评","imageUrls":["https://img.alicdn.com/a.jpg"]}`)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "未配置标题改写模型的 API Key，未提交后续封面设计或生图任务。") {
		t.Fatalf("key %d %s", missing.Code, missing.Body.String())
	}
}

func TestHeadlineTitleRequiresOriginalTitle(t *testing.T) {
	handler := HeadlineTitle(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-title", strings.NewReader(`{"imageUrls":["https://img.alicdn.com/a.jpg"]}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少原标题") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-title", strings.NewReader(`not-json`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "请求数据格式异常") {
		t.Fatalf("json %d body %s", response.Code, response.Body.String())
	}
}

func TestHeadlineTitleRewrites(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"title\":\"台灯到底值不值\"}"}}]}`))
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })
	handler := HeadlineTitle(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-title", strings.NewReader(`{"originalTitle":"台灯测评","imageUrls":["data:image/jpeg;base64,YQ=="],"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "台灯到底值不值") {
		t.Fatalf("title %d %s", response.Code, response.Body.String())
	}
}
