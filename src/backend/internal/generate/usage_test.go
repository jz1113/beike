package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestNormalizeUsageReadsTokenAliases(t *testing.T) {
	top := gateway.NormalizeUsage(map[string]any{"usage": map[string]any{"prompt_tokens": 3.0, "completion_tokens": 4.0, "total_tokens": 7.0}})
	if top["promptTokens"] != 3.0 || top["completionTokens"] != 4.0 || top["totalTokens"] != 7.0 {
		t.Fatalf("chat %#v", top)
	}
	nested := gateway.NormalizeUsage(map[string]any{"data": map[string]any{"usage": map[string]any{"input_tokens": "11", "output_tokens": 22.0}}})
	if nested["promptTokens"] != 11.0 || nested["completionTokens"] != 22.0 || nested["totalTokens"] != 33.0 {
		t.Fatalf("image %#v", nested)
	}
	if gateway.NormalizeUsage(map[string]any{"usage": map[string]any{"prompt_tokens": 0.0}}) != nil {
		t.Fatal("empty usage should be omitted")
	}
	if gateway.NormalizeUsage(map[string]any{"message": "ok"}) != nil {
		t.Fatal("missing usage should be omitted")
	}
}

func TestImagePollReturnsUpstreamUsage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"task_id":"img-usage-1"}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"status":"SUCCESS","url":"https://cdn.example.com/out.jpg","usage":{"input_tokens":11,"output_tokens":22,"total_tokens":33}}}`))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := Image(config.Config{DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	created := httptest.NewRecorder()
	handler.ServeHTTP(created, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if created.Code != http.StatusOK {
		t.Fatalf("submit %d %s", created.Code, created.Body.String())
	}
	polled := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=img-usage-1", nil)
	request.Header.Set("x-custom-base-url", server.URL)
	request.Header.Set("x-custom-api-key", "secret")
	handler.ServeHTTP(polled, request)
	body := polled.Body.String()
	if polled.Code != http.StatusOK || !strings.Contains(body, `"promptTokens":11`) || !strings.Contains(body, `"completionTokens":22`) || !strings.Contains(body, `"totalTokens":33`) {
		t.Fatalf("poll %d %s", polled.Code, body)
	}
}
