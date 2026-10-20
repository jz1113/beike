package keywordreview

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestKeywordHTTPBodyProtocolReachesNativeReview(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1beta/models/custom-vision:generateContent" || r.Header.Get("x-goog-api-key") != "secret" {
			t.Errorf("request %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"{\"results\":[[\"1\",\"动物\",\"制作\",\"猫砂属于宠物用品\",\"\"]]}"}]}}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2,"totalTokenCount":3}}`))
	}))
	defer server.Close()
	body := `{"provider":"gateway","model":"custom-vision","textProtocol":"gemini","rulesVersion":0,"customBaseUrl":"` + server.URL + `","customApiKey":"secret","rows":[{"id":"row-1","query":"猫砂"}]}`
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	r.Header.Set("x-text-protocol", "anthropic")
	result := executeKeywordReview(config.Config{}, r, server.Client())
	if result.status != 200 || calls != 1 {
		t.Fatalf("status %d calls %d body %#v", result.status, calls, result.body)
	}
}

func TestKeywordHTTPInvalidProtocolReturns400(t *testing.T) {
	for _, protocol := range []string{`null`, `"bad"`, `42`} {
		body := `{"textProtocol":` + protocol + `,"rows":[{"id":"a","query":"猫砂"}]}`
		result := executeKeywordReview(config.Config{}, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)), nil)
		if result.status != 400 || !strings.Contains(result.body["error"].(string), "textProtocol") {
			t.Fatalf("result %#v", result)
		}
	}
}
