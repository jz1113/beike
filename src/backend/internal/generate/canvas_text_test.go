package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestCanvasTextBlocksUnsafeGateway(t *testing.T) {
	handler := CanvasText(canvasTextTestConfig(t, "production"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"写一句","customBaseUrl":"http://127.0.0.1/v1"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "密钥未发送到其他网关") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestCanvasTextReadsChatCompletion(t *testing.T) {
	var seenAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"  正文  "}}]}`))
	}))
	defer server.Close()
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasHTTP = previous })
	handler := CanvasText(canvasTextTestConfig(t, "development"))
	request := httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"写一句","customBaseUrl":"`+server.URL+`","customApiKey":"secret"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"text":"正文"`) || seenAuth != "Bearer secret" {
		t.Fatalf("status %d auth %s body %s", response.Code, seenAuth, response.Body.String())
	}
}

func TestCanvasTextRejectsEmptyPrompt(t *testing.T) {
	handler := CanvasText(canvasTextTestConfig(t, "development"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"  "}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "最多 20000 字") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestCanvasTextReadsResponsesAPI(t *testing.T) {
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write([]byte(`{"output_text":"响应正文"}`))
	}))
	defer server.Close()
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { canvasHTTP = previous })
	handler := CanvasText(canvasTextTestConfig(t, "development"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/canvas-text", strings.NewReader(`{"model":"gpt","prompt":"写一句","apiFormat":"openai-responses","customBaseUrl":"`+server.URL+`","customApiKey":"secret"}`)))
	if response.Code != http.StatusOK || path != "/v1/responses" || !strings.Contains(response.Body.String(), `"text":"响应正文"`) {
		t.Fatalf("status %d path %s body %s", response.Code, path, response.Body.String())
	}
}

func TestCanvasChatKeepsToolCallsOnHostGateway(t *testing.T) {
	t.Setenv("AI_API_KEY", "host-test")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer host-test" || r.URL.Path != "/v1/chat/completions" {
			t.Error("wrong route or credentials")
		}
		_, _ = w.Write([]byte(`{"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","function":{"name":"create_node","arguments":"{}"}}]}}]}`))
	}))
	defer upstream.Close()
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_DRAWING_BASE_URL", upstream.URL)
	prev := canvasHTTP
	canvasHTTP = func() *http.Client { return upstream.Client() }
	t.Cleanup(func() { canvasHTTP = prev })
	r := httptest.NewRequest("POST", "/api/generate/canvas-text", strings.NewReader(`{"model":"host-chat","messages":[{"role":"user","content":"创建节点"}],"tools":[{"type":"function","function":{"name":"create_node"}}]}`))
	w := httptest.NewRecorder()
	CanvasText(canvasTextTestConfig(t, "development")).ServeHTTP(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "create_node") || strings.Contains(w.Body.String(), "host-test") {
		t.Fatalf("unexpected response: %d %s", w.Code, w.Body.String())
	}
}

func canvasTextTestConfig(t *testing.T, env string) config.Config {
	t.Helper()
	path := filepath.Join(t.TempDir(), "canvas-receipts.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(submissionSchemaForTest(t)); err != nil {
		t.Fatal(err)
	}
	return config.Config{NodeEnv: env, DatabaseURL: "file:" + path}
}

func TestCanvasVideoPromptOptimizationStageReceipt(t *testing.T) {
	for _, stage := range []string{"compiler", "video"} {
		t.Run(stage, func(t *testing.T) {
			started, release := make(chan struct{}), make(chan struct{})
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				close(started)
				<-release
				if r.Context().Err() != nil {
					t.Error("browser cancellation reached optimization")
				}
				w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"original optimized draft"}}]}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			previous := canvasHTTP
			canvasHTTP = func() *http.Client { return server.Client() }
			defer func() { canvasHTTP = previous }()
			handler := CanvasText(cfg)
			key := "prompt-" + stage
			body := `{"clientTaskId":"` + key + `","model":"test","messages":[{"role":"system","content":"fixed video Skill"},{"role":"user","content":"original video inputs"}],"customBaseUrl":"` + server.URL + `","customApiKey":"private-test"}`
			request := func(ctx context.Context, method, raw string) *httptest.ResponseRecorder {
				r := httptest.NewRequest(method, "/api/generate/canvas-text?operationKey="+key, strings.NewReader(raw)).WithContext(ctx)
				r.Header.Set("x-idempotency-key", key)
				w := httptest.NewRecorder()
				handler.ServeHTTP(w, r)
				return w
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan *httptest.ResponseRecorder, 1)
			go func() { done <- request(ctx, "POST", body) }()
			select {
			case <-started:
			case w := <-done:
				t.Fatal(w.Code, w.Body.String())
			case <-time.After(5 * time.Second):
				t.Fatal("optimization did not dispatch")
			}
			cancel()
			for _, method := range []string{"POST", "GET"} {
				if w := request(context.Background(), method, body); w.Code != 409 {
					t.Fatal(w.Code, w.Body.String())
				}
			}
			close(release)
			if w := <-done; w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			for _, method := range []string{"GET", "POST", "GET"} {
				w := request(context.Background(), method, body)
				if w.Code != 200 || !strings.Contains(w.Body.String(), "original optimized draft") || strings.Contains(w.Body.String(), "private-test") {
					t.Fatal(w.Code, w.Body.String())
				}
			}
			if w := request(context.Background(), "POST", strings.Replace(body, "original video inputs", "changed video inputs", 1)); w.Code != 409 {
				t.Fatal("changed inputs reused key", w.Code)
			}
			if calls.Load() != 1 {
				t.Fatalf("optimization dispatched %d times", calls.Load())
			}
		})
	}
}

func TestConcurrentTextRequestsKeepIndependentProtocols(t *testing.T) {
	var claudeCalls, geminiCalls atomic.Int32
	claudeStarted, geminiStarted := make(chan struct{}), make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var other <-chan struct{}
		var reply string
		switch r.URL.Path {
		case "/v1/messages":
			if claudeCalls.Add(1) == 1 {
				close(claudeStarted)
			}
			other = geminiStarted
			if r.Header.Get("x-api-key") != "claude-key" {
				t.Error("Claude credentials mixed")
			}
			reply = `{"content":[{"type":"text","text":"claude"}],"stop_reason":"end_turn"}`
		case "/v1beta/models/shared-alias:generateContent":
			if geminiCalls.Add(1) == 1 {
				close(geminiStarted)
			}
			other = claudeStarted
			if r.Header.Get("x-goog-api-key") != "gemini-key" {
				t.Error("Gemini credentials mixed")
			}
			reply = `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"gemini"}]}}]}`
		default:
			t.Errorf("unexpected protocol path %s", r.URL.Path)
			w.WriteHeader(500)
			return
		}
		select {
		case <-other:
			_, _ = w.Write([]byte(reply))
		case <-r.Context().Done():
		}
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { gateway.ModelHTTP = previous }()
	results := make(chan error, 2)
	for _, input := range []struct{ protocol, key, want string }{
		{"anthropic", "claude-key", "claude"}, {"gemini", "gemini-key", "gemini"},
	} {
		r := httptest.NewRequest(http.MethodPost, "/", nil)
		r.Header.Set("x-text-protocol", "openai")
		r, ok := BindTextProtocol(httptest.NewRecorder(), r, map[string]any{"textProtocol": input.protocol})
		if !ok {
			t.Fatal("valid protocol rejected")
		}
		go func() {
			// Match asynchronous consumers that outlive the incoming request.
			ctx := context.WithoutCancel(r.Context())
			text, _, status, err := gateway.ChatCompletion(ctx, server.URL, input.key, "shared-alias", []any{map[string]any{"role": "user", "content": "test"}}, .2, 3*time.Second)
			if err == nil && (status != 200 || text != input.want) {
				err = fmt.Errorf("%s got status %d text %q", input.protocol, status, text)
			}
			results <- err
		}()
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	if claudeCalls.Load() != 1 || geminiCalls.Load() != 1 {
		t.Fatalf("calls Claude=%d Gemini=%d", claudeCalls.Load(), geminiCalls.Load())
	}
}

func TestBusinessHTTPBodyProtocolReachesNativeCall(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "secret" {
			t.Errorf("native business request %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"{\"productFingerprint\":\"台灯\",\"prompts\":[{\"shot_no\":1,\"prompt\":\"桌面近景\"}],\"title\":\"台灯实用体验分享\",\"content\":\"提供桌面局部照明。\"}"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":2}}`))
	}))
	defer server.Close()
	priorModel, priorCanvas := gateway.ModelHTTP, canvasHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	canvasHTTP = func() *http.Client { return server.Client() }
	defer func() { gateway.ModelHTTP, canvasHTTP = priorModel, priorCanvas }()
	cfg := canvasTextTestConfig(t, "development")
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
	cfg := canvasTextTestConfig(t, "development")
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
