package assets

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestClearDerivedStorageRemovesFiles(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "derived", "images")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "a.jpg"), []byte("1234"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AZHUO_CACHE_DIR", root)
	response := httptest.NewRecorder()
	clearDerivedStorageHandler(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/local-storage/clear-derived", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["success"] != true || body["clearedFileCount"] != float64(1) || body["clearedBytes"] != float64(4) || body["message"] != "已清理派生磁盘缓存" {
		t.Fatalf("body %#v", body)
	}
	if _, err := os.Stat(filepath.Join(root, "derived")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(root, "derived"))
	if err != nil || len(entries) != 0 {
		t.Fatalf("derived entries %#v err %v", entries, err)
	}
}
