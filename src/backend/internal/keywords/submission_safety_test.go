package keywords

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func safetyRequest(key string) *http.Request {
	body := `{"rulesVersion":0,"customBaseUrl":"https://api.deepseek.com","customApiKey":"test-only","rows":[{"id":"a","query":"苹果"}]}`
	request := httptest.NewRequest(http.MethodPost, "/api/generate/keyword-review", strings.NewReader(body))
	request.Header.Set("x-idempotency-key", key)
	request.Header.Set("x-submission-attempt-id", "original-attempt")
	return request
}

func TestKeywordReviewQuarantinesInterruptedStreamAndReplaysReceipt(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"already generating\"}}]}\n\n"))
	}))
	defer upstream.Close()
	client := upstream.Client()
	client.Transport = rewriteHost(upstream.URL)
	for attempt := 0; attempt < 2; attempt++ {
		got := executeKeywordReview(config.Config{}, safetyRequest("interrupted-stream"), client)
		if got.status != http.StatusBadGateway || got.body["submissionUnknown"] != true {
			t.Fatalf("attempt %d status %d body %#v", attempt, got.status, got.body)
		}
		if got.body["replayed"] != (attempt == 1) {
			t.Fatalf("receipt %#v", got.body)
		}
	}
	if calls != 1 {
		t.Fatalf("interrupted paid generation submitted %d times", calls)
	}
}

func TestKeywordReviewDoesNotFallbackAfterUnknownTransportFailure(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return nil, io.ErrUnexpectedEOF
	})}
	got := executeKeywordReview(config.Config{}, safetyRequest("lost-response"), client)
	if calls != 1 || got.status != http.StatusBadGateway || got.body["submissionUnknown"] != true {
		t.Fatalf("calls %d status %d body %#v", calls, got.status, got.body)
	}
}

func TestKeywordReviewPreservesBilledAndUnknownUpstreamReceipts(t *testing.T) {
	for _, tc := range []struct {
		name, body, field string
		status            int
	}{
		{"billed", `{"usage":{"total_tokens":123},"error":{"message":"已计费但模型失败"}}`, "usage", 503},
		{"unknown", `{"submissionUnknown":true,"error":{"message":"结果待核对"}}`, "submissionUnknown", 503},
		{"unknown-endpoint", `{"submissionUnknown":true,"error":{"message":"结果待核对"}}`, "submissionUnknown", 530},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("AZHUO_DATA_DIR", t.TempDir())
			calls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer upstream.Close()
			client := upstream.Client()
			client.Transport = rewriteHost(upstream.URL)
			for attempt := 0; attempt < 2; attempt++ {
				got := executeKeywordReview(config.Config{}, safetyRequest(tc.name), client)
				if got.status != tc.status || got.body[tc.field] == nil {
					t.Fatalf("status %d body %#v", got.status, got.body)
				}
				if discardUnbilledReject(got.status, got.body) {
					t.Fatalf("paid or uncertain receipt discarded: %#v", got.body)
				}
				if tc.field == "usage" && got.body["usage"].(map[string]any)["total_tokens"] != float64(123) {
					t.Fatalf("usage changed: %#v", got.body)
				}
			}
			if calls != 1 {
				t.Fatalf("paid or uncertain generation submitted %d times", calls)
			}
		})
	}
}
