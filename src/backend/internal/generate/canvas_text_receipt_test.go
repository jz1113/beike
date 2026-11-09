package generate

import (
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestCanvasTextReceiptOriginalKeyReplayAndWorkspace(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"original"}}]}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	defer func() { canvasHTTP = previous }()
	handler := CanvasText(cfg)
	request := func(method, workspace, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/canvas-text?operationKey=original", strings.NewReader(body))
		r = r.WithContext(httpx.WithWorkspace(context.Background(), workspace))
		r.Header.Set("x-idempotency-key", "original")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	body := `{"model":"test","prompt":"original","customBaseUrl":"` + server.URL + `","customApiKey":"mock"}`
	if w := request("POST", "owner", body); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request("POST", "owner", body); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if calls.Load() != 1 {
		t.Fatalf("same operation dispatched %d times", calls.Load())
	}
	if w := request("GET", "owner", ""); w.Code != 200 || !strings.Contains(w.Body.String(), "original") {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request("GET", "other", ""); w.Code != 404 {
		t.Fatal("workspace leak", w.Code)
	}
	if w := request("POST", "owner", strings.Replace(body, `"prompt":"original"`, `"prompt":"changed"`, 1)); w.Code != 409 {
		t.Fatal("input conflict accepted", w.Code)
	}
}

func TestCanvasTextReceiptDisconnectAndConcurrentQuery(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		<-release
		if r.Context().Err() != nil {
			t.Error("browser cancellation reached model")
		}
		w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"done"}}]}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	defer func() { canvasHTTP = previous }()
	handler := CanvasText(cfg)
	body := `{"model":"test","prompt":"analyse","customBaseUrl":"` + server.URL + `","customApiKey":"mock"}`
	request := func(ctx context.Context, method string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/canvas-text?operationKey=disconnect", strings.NewReader(body)).WithContext(ctx)
		r.Header.Set("x-idempotency-key", "disconnect")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- request(ctx, "POST") }()
	select {
	case <-started:
	case w := <-done:
		t.Fatal(w.Code, w.Body.String())
	case <-time.After(5 * time.Second):
		t.Fatal("no dispatch")
	}
	cancel()
	for _, method := range []string{"POST", "GET"} {
		if w := request(context.Background(), method); w.Code != 409 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	close(release)
	if w := <-done; w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(context.Background(), "GET"); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if calls.Load() != 1 {
		t.Fatal(calls.Load())
	}
}

func TestCanvasTextObservationReceiptRecoversWithoutDispatchAfterInterruption(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("recovery dispatched model") }))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	for _, kind := range []string{"canvas-text", "canvas-text-result"} {
		if _, _, err := submission.Claim(t.Context(), cfg.SQLiteFile(), "owner", kind, "interrupted", "fingerprint"); err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest("POST", "/api/generate/canvas-text", nil)
	request = request.WithContext(httpx.WithWorkspace(request.Context(), "owner"))
	request.Header.Set("x-idempotency-key", "interrupted")
	calls := 0
	stage := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "observation": "known observation", "storyboardEvidence": map[string]any{"duration": 15}})
	})
	for i := 0; i < 2; i++ {
		code, _ := canvasObservationReceipt(cfg, request, map[string]any{"model": "test"}, stage)
		if code != 200 {
			t.Fatal(code)
		}
	}
	r := httptest.NewRequest("GET", "/api/generate/canvas-text?operationKey=interrupted", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
	w := httptest.NewRecorder()
	CanvasText(cfg).ServeHTTP(w, r)
	if w.Code != 409 || !strings.Contains(w.Body.String(), "known observation") || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
		t.Fatal(w.Code, w.Body.String())
	}
	if calls != 1 {
		t.Fatal("observation rerun", calls)
	}
}

func TestCanvasTextFinalStageSurvivesOuterSettlementFailure(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Write([]byte(`{"choices":[{"finish_reason":"stop","message":{"content":"durable result"}}]}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	previous := canvasHTTP
	canvasHTTP = func() *http.Client { return server.Client() }
	defer func() { canvasHTTP = previous }()
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`CREATE TRIGGER fail_canvas_outer BEFORE UPDATE ON "GenerationSubmission" WHEN OLD.kind='canvas-text' BEGIN SELECT RAISE(ABORT,'injected'); END`); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("POST", "/api/generate/canvas-text", strings.NewReader(`{"model":"test","prompt":"analyse","customBaseUrl":"`+server.URL+`","customApiKey":"mock"}`))
	r.Header.Set("x-idempotency-key", "outer-failed")
	w := httptest.NewRecorder()
	CanvasText(cfg).ServeHTTP(w, r)
	if w.Code != 503 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	CanvasText(cfg).ServeHTTP(w, httptest.NewRequest("GET", "/api/generate/canvas-text?operationKey=outer-failed", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "durable result") {
		t.Fatal(w.Code, w.Body.String())
	}
	if calls != 1 {
		t.Fatal(calls)
	}
}

func TestCanvasTextMissingReceiptStorageNeverDispatches(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("called model without durable claim") }))
	defer server.Close()
	cfg := canvasTextTestConfig(t, "development")
	cfg.DatabaseURL = "file:" + filepath.Join(t.TempDir(), "missing", "db.sqlite")
	r := httptest.NewRequest("POST", "/api/generate/canvas-text", strings.NewReader(`{"model":"test","prompt":"analyse"}`))
	r.Header.Set("x-idempotency-key", "original")
	w := httptest.NewRecorder()
	CanvasText(cfg).ServeHTTP(w, r)
	if w.Code != 503 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestCanvasStoryboardLegacyImageRejectionIsTerminalOnRead(t *testing.T) {
	for _, detail := range []string{
		"文本模型 test 调用失败（协议 openai，HTTP 400）：text upstream HTTP 400: You uploaded an unsupported image.",
		"文本模型 test 调用失败（协议 openai，HTTP 400）：text upstream HTTP 400: Your input image may contain content that is not allowed by our content safety system.",
		"文本模型 test 调用失败（协议 openai，HTTP 502）：upstream result unavailable",
	} {
		w := httptest.NewRecorder()
		replyCanvasTextReceipt(w, submission.Receipt{Key: "original", Status: 502, Body: map[string]any{
			"stage": "result", "storyboardEvidence": map[string]any{"duration": 13}, "error": detail, "submissionUnknown": true,
		}})
		wantRejected := !strings.Contains(detail, "result unavailable")
		if w.Code != 502 || strings.Contains(w.Body.String(), `"submissionRejected":true`) != wantRejected ||
			strings.Contains(w.Body.String(), `"submissionUnknown":true`) == wantRejected {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
