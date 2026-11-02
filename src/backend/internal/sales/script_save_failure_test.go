package sales

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScriptSavePreservesLinkedVideo(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	cache := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cache)
	rel := "local/azhuo/refs/sales-script/test/source.mp4"
	file := filepath.Join(cache, rel)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("reference fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TRIGGER reject_script BEFORE INSERT ON "SalesReferenceScript" BEGIN SELECT RAISE(ABORT,'test write failure'); END`); err != nil {
		t.Fatal(err)
	}
	requestBody := `{"videoUrl":"/storage/` + rel + `","script":` + validScript + `}`
	rec := httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(requestBody)))
	if rec.Code != 500 {
		t.Fatalf("expected failure: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("failed save removed retry source: %v", err)
	}
	if _, err := db.Exec(`DROP TRIGGER reject_script`); err != nil {
		t.Fatal(err)
	}
	rec = httptest.NewRecorder()
	Scripts(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sales/scripts", strings.NewReader(requestBody)))
	if rec.Code != 200 {
		t.Fatalf("retry failed: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("successful save must retain the linked source: %v", err)
	}
}
