package ppt

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

func TestPptHTTPNativeProtocolPropagation(t *testing.T) {
	cfg := config.Config{NodeEnv: "development"}
	for _, tc := range []struct {
		name, fields, reply string
		handler             http.Handler
	}{
		{"outline", `"ideaPrompt":"台灯"`, "## 台灯改善桌面照明\n- 提供局部光源", PptOutline(cfg)},
		{"detail", `"outlinePages":[{"pageIndex":1,"title":"台灯"}]`, `{"pages":[{"pageIndex":1,"title":"台灯","contentText":"提供局部光源","visualAssets":"台灯","layoutEmphasis":"居中","speakerNotes":"介绍台灯"}]}`, PptDetail(cfg)},
		{"narration", `"pages":[{"pageIndex":1,"title":"台灯","contentText":"提供局部光源"}]`, "=== SLIDE 1 ===\n介绍台灯。", PptNarration(cfg)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			fail := false
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "ppt-key" {
					t.Errorf("native request %s", r.URL.Path)
				}
				if fail {
					w.WriteHeader(503)
					_, _ = w.Write([]byte(`{"error":{"message":"busy"}}`))
					return
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": tc.reply}}, "stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 1, "output_tokens": 2}})
			}))
			defer server.Close()
			previous := generate.ModelHTTP
			generate.ModelHTTP = func() *http.Client { return server.Client() }
			defer func() { generate.ModelHTTP = previous }()
			post := func(protocol string) *httptest.ResponseRecorder {
				body := `{"model":"shared-alias","textProtocol":` + protocol + `,"customBaseUrl":"` + server.URL + `","customApiKey":"ppt-key","allowFallback":true,` + tc.fields + `}`
				r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
				r.Header.Set("x-text-protocol", "gemini")
				rec := httptest.NewRecorder()
				tc.handler.ServeHTTP(rec, r)
				return rec
			}
			rec := post(`"anthropic"`)
			if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"fromFallback":false`) || !strings.Contains(rec.Body.String(), `"totalTokens":3`) {
				t.Fatalf("status %d calls %d body %s", rec.Code, calls, rec.Body.String())
			}
			fail = true
			rec = post(`"anthropic"`)
			if rec.Code != 502 || strings.Contains(rec.Body.String(), `"fromFallback":true`) || calls != 2 {
				t.Fatalf("native failure status %d calls %d body %s", rec.Code, calls, rec.Body.String())
			}
			for _, protocol := range []string{`null`, `42`, `"invalid"`} {
				rec = post(protocol)
				if rec.Code != 400 || !strings.Contains(rec.Body.String(), "textProtocol") || calls != 2 {
					t.Fatalf("invalid protocol status %d calls %d body %s", rec.Code, calls, rec.Body.String())
				}
			}
		})
	}
}
