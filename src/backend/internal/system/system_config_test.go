package system

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestNormalizeGatewayBaseURL(t *testing.T) {
	if got := gateway.NormalizeGatewayBaseURL(" https://ai.example/v1/// "); got != "https://ai.example" {
		t.Fatalf("normalized %q", got)
	}
	if got := gateway.NormalizeGatewayBaseURL("https://ai.example/V1"); got != "https://ai.example" {
		t.Fatalf("normalized %q", got)
	}
}

func TestSystemConfigHidesServerSecrets(t *testing.T) {
	t.Setenv("AI_DRAWING_BASE_URL", "https://gateway.example/v1/")
	t.Setenv("AI_DRAWING_API_KEY", "super-secret-key-should-not-leak")
	t.Setenv("WANBANG_API_KEY", "wanbang-key")
	t.Setenv("WANBANG_API_SECRET", "wanbang-secret-should-not-leak")
	t.Setenv("EXTERNAL_SCRAPER_ID", "scraper")
	t.Setenv("EXTERNAL_SCRAPER_SECRET", "scraper-secret")
	t.Setenv("QIYUN_APP_ID", "qiyun")
	t.Setenv("QIYUN_APP_KEY", "qiyun-key")

	production := serveSystemConfig(t, config.Config{Root: repoRoot(t), NodeEnv: "production"})
	if production["hasApiKey"] != false || production["maskedKey"] != "未配置" || production["hasWanbangKey"] != false || production["hasQiyun"] != false {
		t.Fatalf("production config %#v", production)
	}
	if _, ok := production["wanbangSecret"]; ok {
		t.Fatal("响应不能包含万邦密钥字段")
	}

	development := serveSystemConfig(t, config.Config{Root: repoRoot(t), NodeEnv: "development"})
	if development["hasApiKey"] != true || development["maskedKey"] != "已配置" || development["hasWanbangKey"] != true || development["wanbangSecretConfigured"] != true {
		t.Fatalf("development config %#v", development)
	}
	if development["hasExternalScraper"] != true || development["hasQiyun"] != true || development["normalizedBaseUrl"] != "https://gateway.example" {
		t.Fatalf("development config %#v", development)
	}
	if development["defaultVisionModel"] != "gpt-6-luna" || development["defaultImageModel"] != "gpt-image-2" {
		t.Fatalf("defaults %#v", development)
	}
	if len(development["visionModels"].([]any)) == 0 || len(development["imageModels"].([]any)) == 0 || len(development["fallbackChain"].([]any)) != 0 {
		t.Fatal("模型清单应来自共享目录，降级链保持为空")
	}
	encoded, _ := json.Marshal(development)
	if strings.Contains(string(encoded), "super-secret-key-should-not-leak") || strings.Contains(string(encoded), "wanbang-secret-should-not-leak") {
		t.Fatal("配置响应泄露了密钥明文")
	}
}

func TestSystemConfigPostRequiresCredentials(t *testing.T) {
	handler := systemConfigPostHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/config", bytes.NewBufferString(`{"type":"wanbang"}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("万邦 API Key")) {
		t.Fatalf("wanbang %d %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/config", bytes.NewBufferString(`{}`)))
	if response.Code != http.StatusBadRequest || !bytes.Contains(response.Body.Bytes(), []byte("缺少 AI API Key")) {
		t.Fatalf("ai %d %s", response.Code, response.Body.String())
	}
}

func TestProbeWanbangReadsQuota(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != "key" || r.URL.Query().Get("secret") != "secret" {
			t.Errorf("query %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error_code":"0000","api_info":"today:2 max:100 expires:2026-12-31"}`))
	}))
	defer server.Close()
	ok, quota, message := probeWanbang(context.Background(), server.Client(), "key", "secret", []string{server.URL + "/taobao/item_get/?num_iid=1"})
	if !ok || !strings.Contains(quota, "每日上限: 100") || message != "" {
		t.Fatalf("ok %v quota %s message %s", ok, quota, message)
	}
}

func TestProbeMediaCatalogSeesModel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer key" {
			t.Errorf("auth %s", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-image-2"}]}`))
	}))
	defer server.Close()
	status, body := probeMediaCatalog(context.Background(), server.Client(), server.URL, "key", "gpt-image-2")
	if status != http.StatusOK || body["modelVisible"] != true {
		t.Fatalf("status %d body %#v", status, body)
	}
}

func serveSystemConfig(t *testing.T, cfg config.Config) map[string]any {
	t.Helper()
	response := httptest.NewRecorder()
	systemConfigHandler(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/config", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	configBody, _ := body["config"].(map[string]any)
	if body["success"] != true || configBody == nil {
		t.Fatalf("body %#v", body)
	}
	return configBody
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("找不到仓库根目录")
		}
		dir = parent
	}
}
