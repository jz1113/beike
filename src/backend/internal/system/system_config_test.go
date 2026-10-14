package system

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestNormalizeGatewayBaseURL(t *testing.T) {
	if got := normalizeGatewayBaseURL(" https://ai.example/v1/// "); got != "https://ai.example" {
		t.Fatalf("normalized %q", got)
	}
	if got := normalizeGatewayBaseURL("https://ai.example/V1"); got != "https://ai.example" {
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
	if development["defaultVisionModel"] != "gpt-5.6-luna" || development["defaultImageModel"] != "gpt-image-2" {
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
