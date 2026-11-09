package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestLayerDecompositionRequiresGatewayKey(t *testing.T) {
	t.Setenv("ARK_LAYER_API_KEY", "")
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	handler := LayerDecomposition(cfg)
	body := `{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/png;base64,aGVsbG8=","size":"auto"}`
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(body)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "请先配置聚合平台 API 密钥") {
		t.Fatalf("key %d %s", missing.Code, missing.Body.String())
	}
	t.Setenv("ARK_LAYER_API_KEY", "official")
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			body := `{"data":[{"url":"https://cdn.example.com/a.png","size":"100x80"},{"url":"https://cdn.example.com/b.png","size":"100x80"}]}`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		})}
	}
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	official := httptest.NewRecorder()
	handler.ServeHTTP(official, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(body)))
	if official.Code != http.StatusOK || !strings.Contains(official.Body.String(), "https://cdn.example.com/a.png") || !strings.Contains(official.Body.String(), `"temporaryUrls":true`) {
		t.Fatalf("official %d %s", official.Code, official.Body.String())
	}
}

func TestLayerDecompositionRejectsWrongModel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	handler := LayerDecomposition(cfg)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(`{"model":"other","image":"data:image/png;base64,aGVsbG8=","size":"auto"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "请选择支持图层拆分的模型") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/layer-decomposition", strings.NewReader(`{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/gif;base64,aGVsbG8="}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "PNG/JPEG") {
		t.Fatalf("image %d body %s", response.Code, response.Body.String())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }

func TestLayerUsageSuccessFailureAndRecoveryPreserveOriginalChannel(t *testing.T) {
	for _, scenario := range []string{"success", "invalid-layers", "upstream-failed", "read-error"} {
		t.Run(scenario, func(t *testing.T) {
			t.Setenv("ARK_LAYER_API_KEY", "original-private-key")
			t.Setenv("ARK_LAYER_MODEL", "original-layer-model")
			server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			calls := 0
			gateway.ModelHTTP = func() *http.Client {
				return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
					calls++
					body := `{"usage":{"total_tokens":37},"data":[{"url":"https://example.test/a.png"},{"url":"https://example.test/b.png"}]}`
					status := 200
					if scenario == "invalid-layers" {
						body = `{"usage":{"total_tokens":37},"data":[]}`
					}
					if scenario == "upstream-failed" {
						status = 500
					}
					var reader io.ReadCloser = io.NopCloser(strings.NewReader(body))
					if scenario == "read-error" {
						reader = &layerAuditUsageReader{raw: body}
					}
					return &http.Response{StatusCode: status, Header: make(http.Header), Body: reader}, nil
				})}
			}
			for _, method := range []string{"POST", "GET"} {
				r := httptest.NewRequest(method, "/api/generate/layer-decomposition?operationKey=paid", strings.NewReader(`{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/png;base64,aGVsbG8="}`))
				r.Header.Set("x-idempotency-key", "paid")
				if method == "GET" {
					t.Setenv("ARK_LAYER_API_KEY", "changed-private-key")
					t.Setenv("ARK_LAYER_MODEL", "changed-model")
				}
				w := httptest.NewRecorder()
				LayerDecomposition(cfg).ServeHTTP(w, r)
				var result map[string]any
				_ = json.Unmarshal(w.Body.Bytes(), &result)
				if usage := gateway.NormalizeUsage(result); usage == nil || usage["totalTokens"] != float64(37) {
					t.Fatalf("lost billed usage %s", w.Body.String())
				}
				expected := submission.Hash([]string{"https://ark.cn-beijing.volces.com/api/v3", "original-private-key"})
				if result["usageChannelId"] != expected || result["model"] != "original-layer-model" {
					t.Fatalf("attribution changed %s", w.Body.String())
				}
				if strings.Contains(w.Body.String(), "private-key") {
					t.Fatal("credential exposed")
				}
			}
			if calls != 1 {
				t.Fatal("recovery dispatched again", calls)
			}
		})
	}
}

type layerAuditUsageReader struct{ raw string }

func (r *layerAuditUsageReader) Read(p []byte) (int, error) {
	if r.raw == "" {
		return 0, io.EOF
	}
	n := copy(p, r.raw)
	r.raw = r.raw[n:]
	return n, fmt.Errorf("read interrupted")
}
func (*layerAuditUsageReader) Close() error { return nil }

func TestLayerReceiptDisconnectConcurrentReplayAndWorkspace(t *testing.T) {
	t.Setenv("ARK_LAYER_API_KEY", "mock")
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			calls.Add(1)
			close(started)
			<-release
			if r.Context().Err() != nil {
				t.Error("browser cancellation reached model")
			}
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"data":[{"url":"https://example.test/a.png"},{"url":"https://example.test/b.png"}]}`))}, nil
		})}
	}
	body := `{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/png;base64,` + strings.Repeat("a", 9<<20) + `","size":"auto"}`
	request := func(method, key, workspace, raw string, ctx context.Context) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/layer-decomposition?operationKey="+key, strings.NewReader(raw))
		r = r.WithContext(httpx.WithWorkspace(ctx, workspace))
		r.Header.Set("x-idempotency-key", key)
		w := httptest.NewRecorder()
		LayerDecomposition(cfg).ServeHTTP(w, r)
		return w
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- request("POST", "original", "owner", body, ctx) }()
	select {
	case <-started:
	case w := <-done:
		t.Fatalf("not dispatched: %d %s", w.Code, w.Body.String())
	case <-time.After(5 * time.Second):
		t.Fatal("dispatch timed out")
	}
	cancel()
	pending := request("POST", "original", "owner", body, context.Background())
	if pending.Code != 409 || !strings.Contains(pending.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("pending %d %s", pending.Code, pending.Body.String())
	}
	close(release)
	if w := <-done; w.Code != 200 {
		t.Fatalf("first %d %s", w.Code, w.Body.String())
	}
	for _, method := range []string{"GET", "POST"} {
		w := request(method, "original", "owner", body, context.Background())
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"replayed":true`) {
			t.Fatalf("replay %d %s", w.Code, w.Body.String())
		}
	}
	if w := request("GET", "original", "other", "", context.Background()); w.Code != 404 {
		t.Fatal("workspace leak", w.Code)
	}
	if w := request("POST", "original", "owner", strings.Replace(body, `"auto"`, `"2K"`, 1), context.Background()); w.Code != 409 {
		t.Fatal("changed input accepted", w.Code)
	}
	if calls.Load() != 1 {
		t.Fatal("duplicate model call", calls.Load())
	}
}

func TestLayerUnknownReceiptNeverRedispatches(t *testing.T) {
	t.Setenv("ARK_LAYER_API_KEY", "mock")
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	calls := 0
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			calls++
			return nil, fmt.Errorf("connection lost after acceptance")
		})}
	}
	body := `{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/png;base64,aGVsbG8="}`
	for _, method := range []string{"POST", "GET", "POST"} {
		r := httptest.NewRequest(method, "/api/generate/layer-decomposition?operationKey=lost", strings.NewReader(body))
		r.Header.Set("x-idempotency-key", "lost")
		w := httptest.NewRecorder()
		LayerDecomposition(cfg).ServeHTTP(w, r)
		if w.Code != 502 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
			t.Fatalf("unknown %d %s", w.Code, w.Body.String())
		}
	}
	if calls != 1 {
		t.Fatal("redispatched unknown operation", calls)
	}
}

func TestLayerReceiptStorageFailuresKeepUnknownAndDoNotRedispatch(t *testing.T) {
	t.Setenv("ARK_LAYER_API_KEY", "mock")
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	calls := 0
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"data":[{"url":"https://example.test/a.png"},{"url":"https://example.test/b.png"}]}`))}, nil
		})}
	}
	request := func(cfg config.Config, method, key string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/generate/layer-decomposition?operationKey="+key, strings.NewReader(`{"model":"seedream-v5-pro/layer-decomposition","image":"data:image/png;base64,aGVsbG8="}`))
		r.Header.Set("x-idempotency-key", key)
		w := httptest.NewRecorder()
		LayerDecomposition(cfg).ServeHTTP(w, r)
		return w
	}
	missing := config.Config{DatabaseURL: "file:" + filepath.Join(t.TempDir(), "missing.db")}
	if w := request(missing, "POST", "no-db"); w.Code != 503 || calls != 0 {
		t.Fatalf("dispatch without durable claim %d calls=%d", w.Code, calls)
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TRIGGER refuse_layer_settlement BEFORE UPDATE ON "GenerationSubmission" BEGIN SELECT RAISE(FAIL,'settlement unavailable'); END`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	if w := request(cfg, "POST", "unsettled"); w.Code != 503 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("settlement %d %s", w.Code, w.Body.String())
	}
	for _, method := range []string{"GET", "POST"} {
		if w := request(cfg, method, "unsettled"); w.Code != 409 {
			t.Fatalf("unsettled replay %d %s", w.Code, w.Body.String())
		}
	}
	if calls != 1 {
		t.Fatal("redispatch after failed settlement", calls)
	}
	// A process may disappear after claiming but before it can persist the response.
	if _, owned, err := submission.Claim(context.Background(), cfg.SQLiteFile(), "local", "canvas-layer-decomposition", "interrupted", "unknown-input"); err != nil || !owned {
		t.Fatal(owned, err)
	}
	if w := request(cfg, "GET", "interrupted"); w.Code != 409 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("interrupted %d %s", w.Code, w.Body.String())
	}
	if calls != 1 {
		t.Fatal("interrupted receipt redispatched")
	}
}
