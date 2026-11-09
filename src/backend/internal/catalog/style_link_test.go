package catalog

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestParseLinkRejectsBadBody(t *testing.T) {
	handler := parseLinkHandler(config.Config{})
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
	handler := parseLinkHandler(config.Config{NodeEnv: "production"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/parse-link", strings.NewReader(`{"url":"https://www.xiaohongshu.com/discovery/item/abc","preferredScraper":"wanbang"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "万邦只解析电商商品链接") {
		t.Fatalf("wanbang %d %s", response.Code, response.Body.String())
	}
}

func TestSocialVideoUsesStoredResultWithoutCredentials(t *testing.T) {
	path := filepath.Join(t.TempDir(), "collection.db")
	if err := migrate.Run(path, t.TempDir(), false); err != nil {
		t.Fatal(err)
	}
	db, err := database.OpenRequired(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	const link = "https://www.douyin.com/video/123"
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	key, unlock, err := database.LockCollection(r.Context(), "social:"+link)
	if err != nil {
		t.Fatal(err)
	}
	err = database.SaveCollection(r.Context(), db, key, map[string]any{
		"success": true, "video": "https://example.com/video.mp4",
	}, time.Hour)
	unlock()
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{NodeEnv: "production", DatabaseURL: path}
	status, result := ParseSocialRequest(cfg, r, link+"#share")
	if status != http.StatusOK || result["fromCache"] != true || result["video"] != "https://example.com/video.mp4" {
		t.Fatalf("unexpected cached response: %d %#v", status, result)
	}
}

func TestStyleExtractDeepSeekGate(t *testing.T) {
	handler := extractStyleHandler(config.Config{NodeEnv: "development"})
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
	handler := extractStyleHandler(config.Config{NodeEnv: "development"})
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
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"name\":\"窗边桌搭\",\"category\":\"home_living\",\"tag\":\"暖光\",\"desc\":\"真实窗光\",\"promptSnippet\":\"你是一位种草级商业摄影大师，请按窗边暖光、木桌和浅景深来规划买家秀分镜，并保留商品真实外观。参考图只提供画面结构，商品外观以新商品图片为准，皮肤和材质保留自然纹理。\"}"}}]}`))
	}))
	defer server.Close()
	previous := styleHTTP
	styleHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { styleHTTP = previous })
	handler := extractStyleHandler(config.Config{NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/styles/extract", strings.NewReader(`{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "窗边桌搭") || !strings.Contains(response.Body.String(), `"success":true`) {
		t.Fatalf("extract %d %s", response.Code, response.Body.String())
	}
}

func TestStyleCreateRequiresName(t *testing.T) {
	handler := styleRecipesPostHandler(config.Config{})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/catalog/styles", bytes.NewBufferString(`{"name":""}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestExtractStyleBodySelectsNativeClaude(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "secret" {
			t.Errorf("native request %s", r.URL.Path)
		}
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		encoded, _ := json.Marshal(payload)
		if !strings.Contains(string(encoded), `"type":"image"`) {
			t.Errorf("image not translated: %s", encoded)
		}
		if !strings.Contains(string(encoded), "保留SKU结构") {
			t.Error("existing skill omitted from sample feed")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"name":"柔和自然光","promptSnippet":"自然光商品实拍，商品身份以新商品图片为准，参考样本仅用于构图、机位和光线，完整保留原反推词，只改商品与接触受光关系，保留真实材质纹理，不自动增加棚拍布光。"}`}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 2, "output_tokens": 3}})
	}))
	defer server.Close()
	previous := styleHTTP
	styleHTTP = func() *http.Client { return server.Client() }
	defer func() { styleHTTP = previous }()
	payload := map[string]any{"model": "claude-sonnet-4-5", "textProtocol": "anthropic", "customBaseUrl": server.URL, "customApiKey": "secret", "imageUrls": []any{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}}
	payload["baseSkill"] = map[string]any{"promptSnippet": "保留SKU结构"}
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	r.Header.Set("x-text-protocol", "openai")
	rec := httptest.NewRecorder()
	extractStyle(config.Config{}, rec, r, payload)
	if rec.Code != 200 || calls != 1 || !strings.Contains(rec.Body.String(), "柔和自然光") || !strings.Contains(rec.Body.String(), `"totalTokens":5`) {
		t.Fatalf("status %d calls %d body %s", rec.Code, calls, rec.Body.String())
	}
}
