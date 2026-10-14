package system

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestMemoryCleanupReportsWAL(t *testing.T) {
	handler := memoryCleanupHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/memory-cleanup", nil))
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"gcRun":false`)) || !bytes.Contains(response.Body.Bytes(), []byte("WAL 已清理")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
