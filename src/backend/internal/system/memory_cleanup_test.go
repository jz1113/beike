package system

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/media"
)

func TestMemoryCleanupReportsWAL(t *testing.T) {
	proxyCache.Store("cleanup-test", media.ProxyCacheEntry{Body: []byte("image")})
	handler := memoryCleanupHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/memory-cleanup", nil))
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"gcRun":false`)) || bytes.Contains(response.Body.Bytes(), []byte("WAL 已清理")) || bytes.Contains(response.Body.Bytes(), []byte("当前 RSS")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	var body struct {
		CacheCleared media.ProxyCacheStats
		Cache        media.ProxyCacheStats
		WALResult    any
		After        map[string]uint64
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.CacheCleared.Bytes < 5 || body.Cache.Bytes != 0 || body.WALResult != nil || body.After["runtimeSys"] == 0 {
		t.Fatalf("incorrect cleanup result %+v", body)
	}
}
