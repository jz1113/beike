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
		_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": `{"name":"柔和自然光","promptSnippet":"自然光商品实拍"}`}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 2, "output_tokens": 3}})
	}))
	defer server.Close()
	previous := styleHTTP
	styleHTTP = func() *http.Client { return server.Client() }
	defer func() { styleHTTP = previous }()
	payload := map[string]any{"model": "claude-sonnet-4-5", "textProtocol": "anthropic", "customBaseUrl": server.URL, "customApiKey": "secret", "imageUrls": []any{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}}
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	r.Header.Set("x-text-protocol", "openai")
	rec := httptest.NewRecorder()
	extractStyle(config.Config{}, rec, r, payload)
	if rec.Code != 200 || calls != 1 || !strings.Contains(rec.Body.String(), "柔和自然光") || !strings.Contains(rec.Body.String(), `"totalTokens":5`) {
		t.Fatalf("status %d calls %d body %s", rec.Code, calls, rec.Body.String())
	}
}
