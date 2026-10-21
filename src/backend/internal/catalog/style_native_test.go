package catalog

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

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
