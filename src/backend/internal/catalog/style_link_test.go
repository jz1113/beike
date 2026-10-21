package catalog

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestParseLinkRejectsBadBody(t *testing.T) {
	handler := parseLinkHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	array := httptest.NewRecorder()
	handler.ServeHTTP(array, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/parse-link", strings.NewReader(`[]`)))
	if array.Code != http.StatusBadRequest || !strings.Contains(array.Body.String(), "请求体必须为 JSON 对象") {
		t.Fatalf("array %d %s", array.Code, array.Body.String())
	}
	long := httptest.NewRecorder()
	handler.ServeHTTP(long, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/parse-link", strings.NewReader(`{"url":"`+strings.Repeat("a", 8193)+`"}`)))
	if long.Code != http.StatusBadRequest || !strings.Contains(long.Body.String(), "最多 8192 字符") {
		t.Fatalf("long %d %s", long.Code, long.Body.String())
	}
}

func TestParseLinkRejectsWanbangForSocial(t *testing.T) {
	handler := parseLinkHandler(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "production"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/parse-link", strings.NewReader(`{"url":"https://www.xiaohongshu.com/discovery/item/abc","preferredScraper":"wanbang"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "万邦只解析电商商品链接") {
		t.Fatalf("wanbang %d %s", response.Code, response.Body.String())
	}
}

func TestStyleExtractDeepSeekGate(t *testing.T) {
	handler := extractStyleHandler(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/extract", strings.NewReader(`{"model":"deepseek-official:unknown","imageUrls":["https://example.com/a.jpg"]}`)))
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), "此 DeepSeek 官方模型尚未适配") {
		t.Fatalf("model %d %s", unknown.Code, unknown.Body.String())
	}
	base := httptest.NewRecorder()
	handler.ServeHTTP(base, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/extract", strings.NewReader(`{"model":"deepseek-official:deepseek-flash","customBaseUrl":"https://example.com","imageUrls":["https://example.com/a.jpg"]}`)))
	if base.Code != http.StatusBadRequest || !strings.Contains(base.Body.String(), "只能使用官方接口地址") {
		t.Fatalf("base %d %s", base.Code, base.Body.String())
	}
}

func TestExtractStyleRequiresImageAndKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := extractStyleHandler(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/extract", strings.NewReader(`{}`)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "请至少提供 1 张参考风格图片") {
		t.Fatalf("images %d %s", missing.Code, missing.Body.String())
	}
	nokey := httptest.NewRecorder()
	handler.ServeHTTP(nokey, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/extract", strings.NewReader(`{"imageUrls":["https://example.com/a.jpg"]}`)))
	if nokey.Code != http.StatusInternalServerError || !strings.Contains(nokey.Body.String(), "系统尚未配置 AI 视觉接口密钥") {
		t.Fatalf("key %d %s", nokey.Code, nokey.Body.String())
	}
}

func TestExtractStyleReturnsRecipe(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"name\":\"窗边桌搭\",\"category\":\"home_living\",\"tag\":\"暖光\",\"desc\":\"真实窗光\",\"promptSnippet\":\"你是一位种草级商业摄影大师，请按窗边暖光、木桌和浅景深来规划买家秀分镜，并保留商品真实外观。\"}"}}]}`))
	}))
	defer server.Close()
	previous := styleHTTP
	styleHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { styleHTTP = previous })
	handler := extractStyleHandler(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/extract", strings.NewReader(`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "窗边桌搭") || !strings.Contains(response.Body.String(), `"success":true`) {
		t.Fatalf("extract %d %s", response.Code, response.Body.String())
	}
}
