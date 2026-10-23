package keywords

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestCanonicalKeywordBodyMatchesNode(t *testing.T) {
	body := map[string]any{
		"model": "deepseek-flash", "provider": "deepseek", "lookup": false,
		"customBaseUrl": "https://api.deepseek.com",
		"rows":          []any{map[string]any{"id": "row-1", "query": "猫砂", "expansion": ""}},
	}
	got := canonicalValue(body)
	want := `{"customBaseUrl":"https://api.deepseek.com","lookup":false,"model":"deepseek-flash","provider":"deepseek","rows":[{"expansion":"","id":"row-1","query":"猫砂"}]}`
	if got != want {
		t.Fatalf("canonical %s", got)
	}
}

func TestKeywordReviewRejectsLookupAndDuplicate(t *testing.T) {
	lookup := executeKeywordReview(config.Config{}, httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(`{"rows":[{"id":"1","query":"猫砂"}],"lookup":true,"rulesVersion":0,"customBaseUrl":"https://api.deepseek.com","customApiKey":"secret"}`)), nil)
	if lookup.status != http.StatusBadRequest || lookup.body["error"] != "联网补查已暂停：当前接口不会执行网页搜索。请关闭补查后重试。" {
		t.Fatalf("lookup %#v", lookup.body)
	}
	duplicate := executeKeywordReview(config.Config{}, httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(`{"rows":[{"id":"1","query":"猫砂"},{"id":"1","query":"猫"}]}`)), nil)
	if duplicate.status != http.StatusBadRequest || duplicate.body["error"] != "rows: 关键词行 id 不能重复" {
		t.Fatalf("duplicate %#v", duplicate.body)
	}
}

func TestKeywordReviewReplaysIdempotentResult(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer secret" {
			t.Fatalf("request %s %s", r.URL.Path, r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"usage":{"total_tokens":3},"choices":[{"finish_reason":"stop","message":{"content":"{\"results\":[[\"1\",\"动物\",\"制作\",\"猫砂属于宠物用品\",\"\"]]}"}}]}`))
	}))
	defer server.Close()
	client := server.Client()
	original := keywordDeepSeekBaseURL
	// The review URL is fixed to the official host. Point the test client at the fake server
	// by wrapping the request inside Review through a transport that preserves the path.
	client.Transport = rewriteHost(server.URL)
	body := `{"rulesVersion":0,"customBaseUrl":"https://api.deepseek.com/v1","customApiKey":" secret ","rows":[{"id":"row-1","query":"猫砂"}]}`
	request := func() *http.Request {
		req := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(body))
		req.Header.Set("x-idempotency-key", "batch-1")
		req.Header.Set("x-submission-attempt-id", "attempt-1")
		return req
	}
	first := executeKeywordReview(config.Config{}, request(), client)
	second := executeKeywordReview(config.Config{}, request(), client)
	if calls != 1 {
		t.Fatalf("calls %d", calls)
	}
	if first.status != http.StatusOK || first.body["replayed"] != false || first.header.Get("x-submission-replayed") != "false" {
		t.Fatalf("first status %d body %#v", first.status, first.body)
	}
	encoded, _ := json.Marshal(first.body["results"])
	if !strings.Contains(string(encoded), `"id":"row-1"`) || !strings.Contains(string(encoded), `"category":"动物"`) || !strings.Contains(string(encoded), `"rejectReason":""`) {
		t.Fatalf("results %s", encoded)
	}
	if second.body["replayed"] != true || second.body["submissionAttemptId"] != "attempt-1" {
		t.Fatalf("replay %#v", second.body)
	}
	_ = original
}

func TestKeywordReviewRetriesUnbilledGatewayReject(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"message":"计费账本暂不可用"}}`))
	}))
	defer server.Close()
	body := `{"provider":"gateway","model":"deepseek-v4.1-flash","rulesVersion":0,"customBaseUrl":"` + server.URL + `","customApiKey":"secret","rows":[{"id":"row-1","query":"猫砂"}]}`
	request := func() *http.Request {
		req := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(body))
		req.Header.Set("x-idempotency-key", "batch-503")
		return req
	}
	cfg := config.Config{Root: repoRoot(t)}
	first := executeKeywordReview(cfg, request(), server.Client())
	second := executeKeywordReview(cfg, request(), server.Client())
	if calls != 2 || first.status != http.StatusServiceUnavailable || second.status != http.StatusServiceUnavailable {
		t.Fatalf("calls %d first %d second %d body %#v", calls, first.status, second.status, first.body)
	}
	if first.body["replayed"] == true || second.body["usage"] != nil {
		t.Fatalf("replay %#v %#v", first.body, second.body)
	}
}

func TestKeywordReviewContinuesAfterClientCancel(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		_, _ = w.Write([]byte(`{"usage":{"total_tokens":3},"choices":[{"finish_reason":"stop","message":{"content":"{\"results\":[[\"1\",\"动物\",\"制作\",\"猫砂属于宠物用品\",\"\"]]}"}}]}`))
	}))
	defer server.Close()
	client := server.Client()
	client.Transport = rewriteHost(server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	body := `{"rulesVersion":0,"customBaseUrl":"https://api.deepseek.com","customApiKey":"secret","rows":[{"id":"row-1","query":"猫砂"}]}`
	request := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(body)).WithContext(ctx)
	request.Header.Set("x-idempotency-key", "batch-cancel")
	go func() {
		<-started
		cancel()
		close(release)
	}()
	result := executeKeywordReview(config.Config{}, request, client)
	if result.status != http.StatusOK || len(result.body["results"].([]any)) != 1 {
		t.Fatalf("status %d body %#v", result.status, result.body)
	}
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
			t.Fatal("go.mod not found")
		}
		dir = parent
	}
}

func rewriteHost(target string) http.RoundTripper {
	return roundTripFunc(func(request *http.Request) (*http.Response, error) {
		cloned := request.Clone(request.Context())
		cloned.URL.Scheme = "http"
		cloned.URL.Host = strings.TrimPrefix(strings.TrimPrefix(target, "http://"), "https://")
		cloned.Host = cloned.URL.Host
		return http.DefaultTransport.RoundTrip(cloned)
	})
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }
