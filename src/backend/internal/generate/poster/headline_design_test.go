package poster

import (
	"beike.local/cloud/src/backend/internal/generate"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestCoverPromptsDescribeXiaohongshuDesign(t *testing.T) {
	title := headlineTitlePrompt("洗衣效果很到位", "洗衣机")
	if !strings.Contains(title, "小红书") || !strings.Contains(title, "洗完衣服不发灰") {
		t.Fatal(title)
	}
	design := coverDirectorPrompt("原标题", "洗完衣服不发灰", "3:4", "洗衣机", "上一张是深底", []string{"- [纠正] 不要挡住品牌"})
	for _, phrase := range []string{"咬住", "三色分工", "先写标题怎么被读到"} {
		if !strings.Contains(design, phrase) {
			t.Fatalf("missing %s", phrase)
		}
	}
	if strings.Contains(design, "米白纸纹") {
		t.Fatalf("cold start leaked into remembered design %s", design)
	}
}

func TestCoverPromptColdStartOnlyWithoutMemory(t *testing.T) {
	empty := coverDirectorPrompt("原标题", "洗完衣服不发灰", "3:4", "洗衣机", "", nil)
	if !strings.Contains(empty, "米白纸纹") || !strings.Contains(empty, "不要套用固定风格名") {
		t.Fatal(empty)
	}
	remembered := coverDirectorPrompt("原标题", "洗完衣服不发灰", "3:4", "洗衣机", "", []string{"- [纠正] 不要挡住品牌"})
	if strings.Contains(remembered, "米白纸纹") {
		t.Fatal(remembered)
	}
}

func TestCoverDeconstructPromptKeepsEachCover(t *testing.T) {
	prompt := coverDeconstructPrompt()
	for _, phrase := range []string{"这一张封面", "不要总结成多张封面的共性", "不要套用", "uncertainty", "不会变成记忆条目"} {
		if !strings.Contains(prompt, phrase) {
			t.Fatalf("missing %s", phrase)
		}
	}
	if strings.Contains(prompt, "至少两张") || strings.Contains(prompt, "必须遵守") {
		t.Fatal(prompt)
	}
}

func TestDeconstructRejectsEmptyModelAndMultipleImages(t *testing.T) {
	handler := HeadlineDeconstruct(config.Config{})
	cases := []string{
		`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"model":""}`,
		`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","data:image/jpeg;base64,Yg=="],"model":"vision"}`,
	}
	for _, body := range cases {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-deconstruct", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("status %d body %s", response.Code, response.Body.String())
		}
	}
}

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
	blocked.ServeHTTP(gateway, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["https://img.alicdn.com/a.jpg"],"originalTitle":"台灯","coverTitle":"台灯","customBaseUrl":"http://127.0.0.1","textProtocol":"openai","customApiKey":"secret"}`)))
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
		"layout": "居中压顶", "typeface": "超粗黑体两行", "textColor": "近黑字压在米白底上",
		"background": "米白纸纹，左上柔光", "subject": "台灯居中，灯头不挡字",
		"harmony": "米白、近黑、灯的暖铜三色", "variation": "第一张，取纸感编辑",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	body, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": string(plan)}}}})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(body)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })
	handler := HeadlineDesign(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"originalTitle":"台灯","coverTitle":"台灯","textProtocol":"openai","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "integrated-cover-v5") || !strings.Contains(response.Body.String(), "标题文字锁定") {
		t.Fatalf("design %d %s", response.Code, response.Body.String())
	}
}
