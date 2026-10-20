package library

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/modelgw"
)

func TestDeconstructVisionUsesNativeProtocolOverride(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "secret" {
			t.Errorf("native request %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"{\"per_image\":[{}]}"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":2}}`))
	}))
	defer server.Close()
	outcome := callDeconstructVision(modelgw.WithTextProtocol(context.Background(), "anthropic"), server.URL, "secret", "custom-vision", []string{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}, "分析图片")
	if outcome.Fail != nil || outcome.Text != `{"per_image":[{}]}` || calls != 1 {
		t.Fatalf("outcome %#v calls %d", outcome, calls)
	}
}

func TestDeconstructNativeQuotaIsNotReplayed(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(429)
		_, _ = w.Write([]byte(`{"error":{"message":"quota exhausted"}}`))
	}))
	defer server.Close()
	outcome := callDeconstructVision(context.Background(), server.URL, "secret", "gemini-2.5-flash", []string{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}, "分析图片")
	if outcome.Code != 429 || calls != 1 || !strings.Contains(outcome.Fail["error"].(string), "余额") {
		t.Fatalf("outcome %#v calls %d", outcome, calls)
	}
}

func TestDeconstructInvalidProtocolStopsBeforeImagePreparation(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	status, body := executeDeconstruct(config.Config{}, r, map[string]any{"textProtocol": "invalid", "imageUrls": []any{"https://example.com/image.jpg"}}, deconstructHooks{})
	if status != 400 || !strings.Contains(body["error"].(string), "textProtocol") {
		t.Fatalf("status %d body %#v", status, body)
	}
}
