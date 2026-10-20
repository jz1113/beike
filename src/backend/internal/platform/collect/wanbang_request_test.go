package collect

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func routeCollectServer(t *testing.T, handler http.HandlerFunc) *http.Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	original := buildWanbangURL
	buildWanbangURL = func(input productInput, apiName, key, secret string) string {
		return server.URL + strings.TrimPrefix(original(input, apiName, key, secret), "https://api-gw.onebound.cn")
	}
	t.Cleanup(func() { buildWanbangURL = original })
	return server.Client()
}

func TestWanbangProParametersDoNotCarryItemGetDomainType(t *testing.T) {
	for _, platform := range []string{"jd", "taobao", "1688", "pinduoduo"} {
		for _, method := range []string{"item_get_pro", "item_get"} {
			for _, force := range []bool{false, true} {
				parsed, err := url.Parse(buildWanbangURL(productInput{platform: platform, itemID: "1234567", forceRefresh: force}, method, "test-key", "test-secret"))
				if err != nil {
					t.Fatal(err)
				}
				query := parsed.Query()
				if method == "item_get_pro" && query.Has("domain_type") {
					t.Fatalf("pro included item_get-only domain_type: %s", parsed)
				}
				wantCache := "yes"
				if force {
					wantCache = "no"
				}
				if query.Get("cache") != wantCache || query.Get("num_iid") != "1234567" {
					t.Fatalf("unexpected request %s", parsed)
				}
			}
		}
	}
}

func TestWanbangProtocolErrorsAre502WithoutRetryOrFallback(t *testing.T) {
	cases := []struct{ name, body, message string }{
		{"empty", " \n ", "空响应"},
		{"nonJSON", "<html>upstream error</html>", "非 JSON"},
		{"trailing garbage", `{"item":{}} not-json`, "非 JSON"},
		{"null", `null`, "非 JSON"},
		{"oversized", strings.Repeat("x", wanbangBodyLimit+1), "8 MiB"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var calls atomic.Int32
			client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "text/html")
				_, _ = io.WriteString(w, item.body)
			})
			result := Product(context.Background(), openCollectDB(t), "local", map[string]any{"url": "1234567", "platform": "taobao"}, "test-key", "test-secret", client)
			if result.Status != 502 || calls.Load() != 1 || !strings.Contains(mustJSON(t, result.Body), item.message) {
				t.Fatalf("status=%d calls=%d body=%s", result.Status, calls.Load(), mustJSON(t, result.Body))
			}
		})
	}
}

func TestWanbangBodyLimitAndSingleJSONObject(t *testing.T) {
	valid := `{"error_code":"0000","item":{"title":"ok"}}`
	for _, size := range []int{wanbangBodyLimit - 1, wanbangBodyLimit, wanbangBodyLimit + 1} {
		body := valid + strings.Repeat(" ", size-len(valid))
		_, _, err := parseWanbang([]byte(body), "text/html", 200)
		var bodyErr wanbangBodyError
		if size <= wanbangBodyLimit && err != nil || size > wanbangBodyLimit && (!errors.As(err, &bodyErr) || bodyErr.kind != "tooLarge") {
			t.Fatalf("size=%d err=%v", size, err)
		}
	}
}

func TestWanbangBusinessAndHTTPErrorCallBudgets(t *testing.T) {
	cases := []struct {
		name, platform, body string
		upstream, wantStatus int
		wantCalls            int32
	}{
		{"quota", "jd", `{"error_code":"4016","error":"quota"}`, 200, 402, 1},
		{"not found", "jd", `{"error_code":"2000","error":"not-found"}`, 200, 404, 1},
		{"rate limit", "jd", `{"error_code":"4008","error":"rate limit"}`, 200, 429, 1},
		{"business timeout", "jd", `{"error_code":"4017","error":"timeout"}`, 200, 504, 2},
		{"HTTP timeout", "jd", `timeout`, 408, 504, 2},
		{"HTTP gateway timeout", "jd", `timeout`, 504, 504, 2},
		{"server failure JD no fallback", "jd", `failure`, 503, 502, 2},
		{"HTTP permission", "jd", `denied`, 403, 400, 1},
		{"HTTP rate limit", "jd", `rate limit`, 429, 429, 1},
		{"existing other-platform maximum", "taobao", `{"error_code":"4000","error":"temporary"}`, 200, 502, 4},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var calls atomic.Int32
			client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if item.platform == "jd" && !strings.Contains(r.URL.Path, "/jd/item_get_pro/") {
					t.Errorf("unexpected JD fallback %s", r.URL.Path)
				}
				w.WriteHeader(item.upstream)
				_, _ = io.WriteString(w, item.body)
			})
			result := Product(context.Background(), openCollectDB(t), "local", map[string]any{"url": "1234567", "platform": item.platform}, "test-key", "test-secret", client)
			if result.Status != item.wantStatus || calls.Load() != item.wantCalls {
				t.Fatalf("status=%d want=%d calls=%d want=%d body=%s", result.Status, item.wantStatus, calls.Load(), item.wantCalls, mustJSON(t, result.Body))
			}
		})
	}
}

func TestWanbangTemporaryErrorThenSuccessUsesTwoRequests(t *testing.T) {
	var calls atomic.Int32
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			_, _ = io.WriteString(w, `{"error_code":"4001","error":"temporary"}`)
			return
		}
		_, _ = io.WriteString(w, `{"error_code":"0000","item":{"title":"商品","pic_url":"//img.alicdn.com/a.webp"}}`)
	})
	result := Product(context.Background(), openCollectDB(t), "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	if result.Status != 200 || calls.Load() != 2 {
		t.Fatalf("result=%#v calls=%d", result, calls.Load())
	}
}

func TestWanbangCancelDuringRetryWaitHasNoSecondPaidCall(t *testing.T) {
	for _, kind := range []string{"business", "http"} {
		t.Run(kind, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var calls atomic.Int32
			client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if kind == "http" {
					w.WriteHeader(503)
				}
				_, _ = io.WriteString(w, `{"error_code":"4000","error":"temporary"}`)
			})
			// The parent cancellation interrupts the timer well before its 1s wait.
			db := openCollectDB(t)
			timer := time.AfterFunc(80*time.Millisecond, cancel)
			defer timer.Stop()
			start := time.Now()
			result := Product(ctx, db, "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
			if result.Status != 499 || calls.Load() != 1 || time.Since(start) > 700*time.Millisecond {
				t.Fatalf("status=%d calls=%d elapsed=%s", result.Status, calls.Load(), time.Since(start))
			}
		})
	}
}

func TestWanbangCanceledBeforeRequestAndCallerDeadline(t *testing.T) {
	var calls atomic.Int32
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1) })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result := Product(ctx, openCollectDB(t), "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	if result.Status != 499 || calls.Load() != 0 {
		t.Fatalf("result=%#v calls=%d", result, calls.Load())
	}
	ctx, cancel = context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	result = Product(ctx, openCollectDB(t), "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	if result.Status != 504 || calls.Load() != 0 {
		t.Fatalf("result=%#v calls=%d", result, calls.Load())
	}
}

type collectRoundTripper func(*http.Request) (*http.Response, error)

func (transport collectRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestWanbangTransportTimeoutBudget(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: collectRoundTripper(func(r *http.Request) (*http.Response, error) {
		calls++
		return nil, fmt.Errorf("transport timeout: %w", context.DeadlineExceeded)
	})}
	result := Product(context.Background(), openCollectDB(t), "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	if result.Status != 504 || calls != 2 {
		t.Fatalf("status=%d calls=%d body=%s", result.Status, calls, mustJSON(t, result.Body))
	}
}
