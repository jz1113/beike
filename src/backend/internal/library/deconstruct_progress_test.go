package library

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestDeconstructProgressRequiresTask(t *testing.T) {
	handler := deconstructProgressHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/deconstruct/progress", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少有效的任务 ID") {
		t.Fatalf("progress %d %s", response.Code, response.Body.String())
	}
}
