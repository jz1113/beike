package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestAnalyzeRequiresVisionKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := Analyze(analyzeReceiptConfig(t))
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
	handler := Analyze(analyzeReceiptConfig(t))
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
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"productFingerprint\":\"台灯\",\"productRole\":\"主体\",\"masterScene\":\"书桌\",\"prompts\":[{\"shot\":1,\"prompt\":\"近景\"}]}"}}]}`))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := Analyze(analyzeReceiptConfig(t))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"clientTaskId":"s13-analysis-receipt","productTitle":"台灯","shotCount":1,"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"productFingerprint":"台灯"`) || !strings.Contains(response.Body.String(), `"prompt":"近景"`) {
		t.Fatalf("analyze %d %s", response.Code, response.Body.String())
	}
	recovered := httptest.NewRecorder()
	handler.ServeHTTP(recovered, httptest.NewRequest(http.MethodGet, "/api/generate/analyze?operationKey=s13-analysis-receipt", nil))
	if recovered.Code != http.StatusOK || !strings.Contains(recovered.Body.String(), "近景") || calls != 1 {
		t.Fatalf("recovery %d calls %d: %s", recovered.Code, calls, recovered.Body.String())
	}
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/api/generate/analyze", strings.NewReader(`{"clientTaskId":"s13-analysis-receipt","productTitle":"changed"}`)))
	if calls != 1 {
		t.Fatalf("duplicate invoked model %d times", calls)
	}
}

func TestCopywritingLocalFallback(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := Copywriting(analyzeReceiptConfig(t))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"翡翠手镯"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"fromFallback":true`) || !strings.Contains(response.Body.String(), "翡翠手镯商品资料") {
		t.Fatalf("fallback %d %s", response.Code, response.Body.String())
	}
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"productTitle":"翡翠手镯","existingTitles":["翡翠手镯商品资料"]}`)))
	if !strings.Contains(duplicate.Body.String(), "商品细节关于翡翠手镯") {
		t.Fatalf("duplicate %s", duplicate.Body.String())
	}
}

func TestCopywritingWithKeyUsesModel(t *testing.T) {
	var seenAuth string
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		seenAuth = r.Header.Get("Authorization")
		input, _ := io.ReadAll(r.Body)
		for _, want := range []string{"圆领", "窗边", "image_url", "https://example.com/result.jpg"} {
			if !strings.Contains(string(input), want) {
				t.Errorf("missing copy evidence %q", want)
			}
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"title\":\"窗边的条纹针织衫\",\"content\":\"细条纹延伸至袖口。\",\"tags\":[]}"}}]}`))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := Copywriting(analyzeReceiptConfig(t))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"clientTaskId":"s13-copy-receipt","productTitle":"针织衫","productProps":{"领型":"圆领"},"shotPrompts":["窗边"],"imageUrls":["https://example.com/result.jpg"],"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "fromFallback") || !strings.Contains(response.Body.String(), "细条纹延伸至袖口。") || seenAuth != "Bearer secret" {
		t.Fatalf("model %d auth %s body %s", response.Code, seenAuth, response.Body.String())
	}
	recovered := httptest.NewRecorder()
	handler.ServeHTTP(recovered, httptest.NewRequest(http.MethodGet, "/api/generate/copywriting?operationKey=s13-copy-receipt", nil))
	if recovered.Code != http.StatusOK || !strings.Contains(recovered.Body.String(), "细条纹延伸至袖口。") || calls != 1 {
		t.Fatalf("recovery %d calls %d: %s", recovered.Code, calls, recovered.Body.String())
	}
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/api/generate/copywriting", strings.NewReader(`{"clientTaskId":"s13-copy-receipt","productTitle":"changed"}`)))
	if calls != 1 {
		t.Fatalf("duplicate invoked model %d times", calls)
	}
}

func analyzeReceiptConfig(t *testing.T) config.Config {
	t.Helper()
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	path := filepath.Join(t.TempDir(), "receipt.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	return config.Config{NodeEnv: "development", Root: root, DatabaseURL: "file:" + path}
}
