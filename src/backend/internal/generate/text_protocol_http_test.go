package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestBusinessHTTPBodyProtocolReachesNativeCall(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "secret" {
			t.Errorf("native business request %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"{\"productFingerprint\":\"台灯\",\"prompts\":[],\"title\":\"台灯实用体验分享\",\"content\":\"提供桌面局部照明。\"}"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":2}}`))
	}))
	defer server.Close()
	priorModel, priorCanvas := ModelHTTP, canvasHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	canvasHTTP = func() *http.Client { return server.Client() }
	defer func() { ModelHTTP, canvasHTTP = priorModel, priorCanvas }()
	cfg := config.Config{NodeEnv: "development"}
	cases := []struct {
		name    string
		handler http.Handler
	}{
		{"raw body analyze", Analyze(cfg)}, {"canvas text", CanvasText(cfg)}, {"copywriting", Copywriting(cfg)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := `{"model":"custom-text","textProtocol":"anthropic","prompt":"写一句","productTitle":"台灯","shotCount":1,"customBaseUrl":"` + server.URL + `","customApiKey":"secret"}`
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
			r.Header.Set("x-text-protocol", "gemini")
			rec := httptest.NewRecorder()
			tc.handler.ServeHTTP(rec, r)
			if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"success":true`) || !strings.Contains(rec.Body.String(), `"totalTokens":3`) {
				t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
			}
		})
	}
	if calls != len(cases) {
		t.Fatalf("native calls %d", calls)
	}
}

func TestBusinessHTTPInvalidProtocolStopsBeforeUpstream(t *testing.T) {
	cfg := config.Config{}
	for _, handler := range []http.Handler{Analyze(cfg), CanvasText(cfg), Copywriting(cfg)} {
		for _, protocol := range []string{`null`, `42`, `"invalid"`} {
			rec := httptest.NewRecorder()
			body := `{"model":"custom-text","prompt":"写一句","textProtocol":` + protocol + `}`
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
			if rec.Code != 400 || !strings.Contains(rec.Body.String(), "textProtocol") {
				t.Fatalf("invalid protocol status %d body %s", rec.Code, rec.Body.String())
			}
		}
	}
}
