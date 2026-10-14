package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestHeadlineDesignSchemaOrder(t *testing.T) {
	handler := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1"})
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{}`)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "imageUrls: Required") {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
	tooMany := httptest.NewRecorder()
	handler.ServeHTTP(tooMany, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["a","b","c"]}`)))
	if tooMany.Code != http.StatusBadRequest || !strings.Contains(tooMany.Body.String(), "imageUrls: 最多使用两张商品图片") {
		t.Fatalf("count %d %s", tooMany.Code, tooMany.Body.String())
	}
	name := httptest.NewRecorder()
	handler.ServeHTTP(name, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"productName":1}`)))
	if name.Code != http.StatusBadRequest || !strings.Contains(name.Body.String(), "productName: Expected string, received number") {
		t.Fatalf("name %d %s", name.Code, name.Body.String())
	}
}

func TestHeadlineDesignRequiresKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1"})
	body := `{"imageUrls":["https://img.alicdn.com/a.jpg"],"originalTitle":"台灯","coverTitle":"台灯"}`
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(body)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "未配置封面设计模型的 API Key，未提交生图任务。") {
		t.Fatalf("key %d %s", missing.Code, missing.Body.String())
	}
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"model":"deepseek-official:unknown","imageUrls":["https://img.alicdn.com/a.jpg"],"originalTitle":"台灯","coverTitle":"台灯"}`)))
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), "此 DeepSeek 官方模型尚未适配") {
		t.Fatalf("model %d %s", unknown.Code, unknown.Body.String())
	}
	blocked := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "production"})
	gateway := httptest.NewRecorder()
	blocked.ServeHTTP(gateway, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["https://img.alicdn.com/a.jpg"],"originalTitle":"台灯","coverTitle":"台灯","customBaseUrl":"http://127.0.0.1","customApiKey":"secret"}`)))
	if gateway.Code != http.StatusBadRequest || !strings.Contains(gateway.Body.String(), "当前接口地址与服务器允许的视觉网关不一致") {
		t.Fatalf("gateway %d %s", gateway.Code, gateway.Body.String())
	}
}

func TestHeadlineDesignRequiresTitles(t *testing.T) {
	handler := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["https://img.alicdn.com/a.jpg"]}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少原标题或已确认的封面标题") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestHeadlineDesignReturnsPlan(t *testing.T) {
	plan, _ := json.Marshal(map[string]any{
		"title": "台灯", "titleLines": []string{"台灯"}, "productNameLine": "",
		"composition": "居中", "material": "木桌", "palette": "暖白", "artDirectionId": "A",
		"typographySystem": "A", "typography": "粗黑", "visualAnchor": "灯", "styleFamily": "桌面",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(plan)}}}})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(body)
	}))
	defer server.Close()
	previous := modelHTTP
	modelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { modelHTTP = previous })
	handler := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["data:image/jpeg;base64,YQ=="],"originalTitle":"台灯","coverTitle":"台灯","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "integrated-cover-v4") || !strings.Contains(response.Body.String(), "标题文字锁定") {
		t.Fatalf("design %d %s", response.Code, response.Body.String())
	}
}
