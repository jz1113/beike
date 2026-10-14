package collect

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestResolveProductInputRejectsShortLink(t *testing.T) {
	_, message := resolveProductInput(map[string]any{"url": "https://u.jd.com/abc"})
	if !strings.Contains(message, "短链") {
		t.Fatalf("message %s", message)
	}
	input, message := resolveProductInput(map[string]any{"url": "https://item.jd.com/1234567.html"})
	if message != "" || input.platform != "jd" || input.itemID != "1234567" {
		t.Fatalf("input %#v %s", input, message)
	}
}

func TestCollectUsesCacheWithoutCallingUpstream(t *testing.T) {
	db := openCollectDB(t)
	detail := `{"main":["https://img.alicdn.com/a.jpg"],"details":[],"skus":[],"props":{"颜色":"白"},"price":12.5,"brand":"贝壳","category":"箱包"}`
	if _, err := db.Exec(`INSERT INTO "Product" ("id","workspaceId","platform","itemId","title","picUrl","detailUrls","createdAt") VALUES
		('row','local','jd','1234567','缓存商品','https://img.alicdn.com/a.jpg',?,'2026-01-01T00:00:00.000Z')`, detail); err != nil {
		t.Fatal(err)
	}
	result := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", nil)
	if result.Status != http.StatusOK || !strings.Contains(mustJSON(t, result.Body), `"fromCache":true`) || strings.Contains(mustJSON(t, result.Body), "missingConfig") {
		t.Fatalf("cache %#v", result.Body)
	}
}

func TestCollectStoresWanbangProduct(t *testing.T) {
	db := openCollectDB(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/jd/item_get_pro/") || r.URL.Query().Get("num_iid") != "1234567" || r.URL.Query().Get("key") != "key" {
			t.Errorf("url %s", r.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error_code":"0000","item":{"title":"测试商品","price":"19.9","brand":"贝壳","pic_url":"https://img.alicdn.com/a.jpg","props":[{"name":"颜色","value":"白"}]}}`))
	}))
	defer server.Close()
	original := buildWanbangURL
	buildWanbangURL = func(input productInput, apiName, apiKey, apiSecret string) string {
		return server.URL + original(input, apiName, apiKey, apiSecret)[len("https://api-gw.onebound.cn"):]
	}
	defer func() { buildWanbangURL = original }()
	result := Product(context.Background(), db, "local", map[string]any{"platform": "jd", "url": "1234567"}, "key", "secret", server.Client())
	if result.Status != http.StatusOK || !strings.Contains(mustJSON(t, result.Body), `"title":"测试商品"`) || !strings.Contains(mustJSON(t, result.Body), `"颜色":"白"`) {
		t.Fatalf("fresh %#v", result.Body)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Product" WHERE "itemId" = '1234567'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("stored %d %v", count, err)
	}
}

func openCollectDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "collect.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "Product" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "platform" TEXT, "itemId" TEXT, "title" TEXT,
		"picUrl" TEXT, "detailUrls" TEXT, "createdAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	return db
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}
