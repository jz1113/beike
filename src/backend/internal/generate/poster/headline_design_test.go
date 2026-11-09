package poster

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestCoverPromptsDescribeXiaohongshuDesign(t *testing.T) {
	title := headlineTitlePrompt("洗衣效果很到位", "洗衣机")
	if !strings.Contains(title, "小红书") || !strings.Contains(title, "洗完衣服不发灰") {
		t.Fatal(title)
	}
	design := coverDirectorPrompt("原标题", "洗完衣服不发灰", "3:4", "洗衣机", "上一张是深底", []string{"- [纠正] 不要挡住品牌"})
	for _, phrase := range []string{"摄影", "不继承样张品牌", "画面类型与比例", "只上传当前商品图"} {
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
	handler := headlineDesignTestHandler(t, config.Config{})
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
	handler := headlineDesignTestHandler(t, config.Config{})
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
	blocked := headlineDesignTestHandler(t, config.Config{NodeEnv: "production"})
	gateway := httptest.NewRecorder()
	blocked.ServeHTTP(gateway, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["https://img.alicdn.com/a.jpg"],"originalTitle":"台灯","coverTitle":"台灯","customBaseUrl":"http://127.0.0.1","textProtocol":"openai","customApiKey":"secret"}`)))
	if gateway.Code != http.StatusBadRequest || !strings.Contains(gateway.Body.String(), "当前接口地址与服务器允许的视觉网关不一致") {
		t.Fatalf("gateway %d %s", gateway.Code, gateway.Body.String())
	}
}

func TestHeadlineDesignRequiresTitles(t *testing.T) {
	handler := headlineDesignTestHandler(t, config.Config{})
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
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := headlineDesignTestHandler(t, config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-design", strings.NewReader(`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"originalTitle":"台灯","coverTitle":"台灯","textProtocol":"openai","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "reference-cover-v6") || !strings.Contains(response.Body.String(), "标题文字锁定") {
		t.Fatalf("design %d %s", response.Code, response.Body.String())
	}
}

func TestHeadlineTitleSchemaAndKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := headlineTitleTestHandler(t, config.Config{})
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
	handler := headlineTitleTestHandler(t, config.Config{})
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
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := headlineTitleTestHandler(t, config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/headline-title", strings.NewReader(`{"originalTitle":"台灯测评","imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"textProtocol":"openai","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "台灯到底值不值") {
		t.Fatalf("title %d %s", response.Code, response.Body.String())
	}
}

func TestCoverDesignRejectsReferenceDependencyAndChangedTitle(t *testing.T) {
	makePlan := func() map[string]any {
		raw := map[string]any{}
		for _, key := range []string{"composition", "material", "palette", "typographySystem", "typography", "visualAnchor", "styleFamily", "layout", "typeface", "textColor", "background", "subject", "harmony", "variation"} {
			raw[key] = "具体设计"
		}
		raw["imagePrompt"] = strings.Repeat("主体置于画面右侧，保留原图标识，左侧排版标题。", 12)
		raw["titleLines"] = []any{"轻巧随身", "记录生活"}
		return raw
	}
	for _, dependency := range []string{"参考图2", "参考图 2", "沿用参考图排版", "同款风格", "上一张"} {
		raw := makePlan()
		raw["imagePrompt"] = raw["imagePrompt"].(string) + dependency
		if _, message := validateCoverDesign(raw, "轻巧随身记录生活", ""); message == "" {
			t.Fatalf("accepted dependent prompt: %s", dependency)
		}
	}
	raw := makePlan()
	raw["titleLines"] = []any{"虚构效果", "记录生活"}
	if _, message := validateCoverDesign(raw, "轻巧随身记录生活", ""); message == "" {
		t.Fatal("accepted changed title")
	}
	valid, message := validateCoverDesign(makePlan(), "轻巧随身记录生活", "")
	if message != "" || !strings.Contains(valid["imagePrompt"].(string), "第 2 行「记录生活」") {
		t.Fatalf("valid design: %v %s", valid, message)
	}
}

func TestCoverSupplementaryRequirementsValidation(t *testing.T) {
	for _, raw := range []string{`{"imageUrls":["a"],"supplementaryRequirements":3}`, `{"imageUrls":["a"],"supplementaryRequirements":"` + strings.Repeat("字", 2001) + `"}`} {
		if message := headlineDesignSchemaError([]byte(raw)); !strings.Contains(message, "supplementaryRequirements") {
			t.Fatal(message)
		}
	}
	if message := headlineDesignSchemaError([]byte(`{"imageUrls":["a"],"supplementaryRequirements":"暖白配色"}`)); message != "" {
		t.Fatal(message)
	}
}

func TestHeadlineHTTPNativeProtocolPropagation(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "cover_memory.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	plan, _ := json.Marshal(map[string]any{
		"title": "台灯", "titleLines": []string{"台灯"}, "productNameLine": "",
		"composition": "居中", "material": "木桌", "palette": "暖白", "artDirectionId": "A",
		"typographySystem": "A", "typography": "粗黑", "visualAnchor": "灯", "styleFamily": "桌面",
		"layout": "居中压顶", "typeface": "超粗黑体两行", "textColor": "近黑字压在米白底上",
		"background": "米白纸纹，左上柔光", "subject": "台灯居中，灯头不挡字",
		"harmony": "米白、近黑、灯的暖铜三色", "variation": "第一张，取纸感编辑",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	for _, tc := range []struct {
		name, reply string
		handler     http.Handler
	}{
		{"title", `{"title":"台灯到底值不值"}`, headlineTitleTestHandler(t, cfg)},
		{"design", string(plan), headlineDesignTestHandler(t, cfg)},
		{"deconstruct", `{"layout":{"rule":"标题压住商品上沿","evidence":"顶部两行"}}`, HeadlineDeconstruct(cfg)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "cover-key" {
					t.Errorf("native request %s", r.URL.Path)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": tc.reply}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 1, "output_tokens": 2}})
			}))
			defer server.Close()
			previous := gateway.ModelHTTP
			gateway.ModelHTTP = func() *http.Client { return server.Client() }
			defer func() { gateway.ModelHTTP = previous }()
			post := func(protocol string) *httptest.ResponseRecorder {
				body := `{"model":"shared-vision","originalTitle":"台灯测评","coverTitle":"台灯","imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"textProtocol":` + protocol + `,"customBaseUrl":"` + server.URL + `","customApiKey":"cover-key"}`
				r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
				r.Header.Set("x-text-protocol", "gemini")
				rec := httptest.NewRecorder()
				tc.handler.ServeHTTP(rec, r)
				return rec
			}
			rec := post(`"anthropic"`)
			if rec.Code != 200 || calls.Load() != 1 || !strings.Contains(rec.Body.String(), `"totalTokens":3`) {
				t.Fatalf("status %d calls %d body %s", rec.Code, calls.Load(), rec.Body.String())
			}
			for _, protocol := range []string{`null`, `42`, `"invalid"`} {
				rec = post(protocol)
				if rec.Code != 400 || !strings.Contains(rec.Body.String(), "textProtocol") || calls.Load() != 1 {
					t.Fatalf("invalid protocol status %d calls %d body %s", rec.Code, calls.Load(), rec.Body.String())
				}
			}
		})
	}
}
