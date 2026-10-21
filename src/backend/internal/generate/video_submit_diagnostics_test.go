package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVideoSubmitDiagnosticsHideSecretsAndURLs(t *testing.T) {
	reason := safeVideoSubmitReason("rejected key-value https://host/secret?token=private", "key-value", 503, 1)
	for _, hidden := range []string{"key-value", "https://host", "private"} {
		if strings.Contains(reason, hidden) {
			t.Fatal(reason)
		}
	}
	if !strings.Contains(reason, "HTTP 503") || !strings.Contains(reason, "尝试 1") {
		t.Fatal(reason)
	}
}

func TestVideoSubmitDiagnosisSurvivesOriginalReceiptLookup(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"message":"adapter unavailable"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	submitted := videoSubmissionTestPost(Video(cfg), server.URL, "diagnostic-key", "商品展示", "local")
	queried := videoSubmissionTestGet(Video(cfg), "diagnostic-key", "local")
	for _, response := range []*httptest.ResponseRecorder{submitted, queried} {
		if !strings.Contains(response.Body.String(), "adapter unavailable") || !strings.Contains(response.Body.String(), "HTTP 503") {
			t.Fatal(response.Body.String())
		}
	}
}
