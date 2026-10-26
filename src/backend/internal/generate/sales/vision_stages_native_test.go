package sales

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

func TestSalesSelectionAndFinalizeNativeProtocols(t *testing.T) {
	cfg := config.Config{NodeEnv: "development"}
	for _, tc := range []struct {
		name, protocol, key, path, reply string
		handler                          http.Handler
	}{
		{"selection", "gemini", "select-key", "/v1beta/models/shared-vision:generateContent", `{"assignments":[{"shotId":1,"imageIndex":2,"reason":"正面主图"}]}`, Select(cfg)},
		{"finalize", "anthropic", "final-key", "/v1/messages", `{"fullPrompt":"整段展示台灯","prompts":[{"shotId":1,"prompt":"展示台灯"}]}`, Finalize(cfg)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				header := "x-api-key"
				if tc.protocol == "gemini" {
					header = "x-goog-api-key"
				}
				if r.URL.Path != tc.path || r.Header.Get(header) != tc.key {
					t.Errorf("stage protocol or credentials mixed: %s", r.URL.Path)
				}
				if tc.protocol == "gemini" {
					_ = json.NewEncoder(w).Encode(map[string]any{"candidates": []any{map[string]any{"finishReason": "STOP", "content": map[string]any{"parts": []any{map[string]any{"text": tc.reply}}}}}})
				} else {
					_ = json.NewEncoder(w).Encode(map[string]any{"content": []any{map[string]any{"type": "text", "text": tc.reply}}, "stop_reason": "end_turn"})
				}
			}))
			defer server.Close()
			previous := generate.ModelHTTP
			generate.ModelHTTP = func() *http.Client { return server.Client() }
			defer func() { generate.ModelHTTP = previous }()
			body := `{"workflowVersion":3,"category":"fashion","assets":[{"id":"scene","kind":"scene","label":"房间","prompt":"实拍房间","required":false}],"operation":"finalize","targetDuration":15,"aspectRatio":"9:16","model":"shared-vision","textProtocol":"` + tc.protocol + `","customBaseUrl":"` + server.URL + `","customApiKey":"` + tc.key + `","shots":[{"shotId":1,"imageIndex":2,"duration":15,"description":"展示台灯","speechMode":"voiceover","voiceover":"展示台灯"}],"imageCatalog":[{"index":2,"role":"main","url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}],"eligibleImageIndexes":[2],"actualReferences":[{"id":"lamp","kind":"product","label":"台灯","url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}]}`
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
			r.Header.Set("x-text-protocol", "openai")
			rec := httptest.NewRecorder()
			tc.handler.ServeHTTP(rec, r)
			if rec.Code != 200 || calls.Load() != 1 || !strings.Contains(rec.Body.String(), `"success":true`) {
				t.Fatalf("status %d calls %d body %s", rec.Code, calls.Load(), rec.Body.String())
			}
		})
	}
}

func TestSalesHTTPInvalidProtocolReturns400(t *testing.T) {
	cfg := config.Config{}
	for _, handler := range []http.Handler{Analyze(cfg), Script(cfg), Select(cfg), Finalize(cfg)} {
		for _, protocol := range []string{`null`, `42`, `"invalid"`} {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"textProtocol":`+protocol+`}`))
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, r)
			if rec.Code != 400 || !strings.Contains(rec.Body.String(), "textProtocol") {
				t.Fatalf("invalid protocol status %d body %s", rec.Code, rec.Body.String())
			}
		}
	}
}
