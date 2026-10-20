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

func TestCollectAcceptsOfficialWanbangSuccessEnvelope(t *testing.T) {
	db := openCollectDB(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/jd/item_get_pro/") || r.URL.Query().Get("num_iid") != "10235916959245" {
			t.Errorf("url %s", r.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"item": {
				"num_iid": "10235916959245",
				"title": "京东测试商品",
				"price": "30.90",
				"orginal_price": "49.00",
				"nick": "京东自营",
				"brand": "贝壳",
				"rootCatId": "1315",
				"pic_url": "//img13.360buyimg.com/n12/jfs/t1/125462/28/28387/257349/62e60e0bEddd31475/41ed23e1642bd846.jpg",
				"desc": "",
				"desc_img": "",
				"item_imgs": {"item_img": [{"url": "//img10.360buyimg.com/n1/jfs/t1/233092/38/27075/59513/66decdddFe35f87b5/d7bb1d6573c8dd24.jpg"}]},
				"props": []
			},
			"error": "",
			"reason": "",
			"error_code": "0000"
		}`))
	}))
	defer server.Close()
	original := buildWanbangURL
	buildWanbangURL = func(input productInput, apiName, apiKey, apiSecret string) string {
		return server.URL + original(input, apiName, apiKey, apiSecret)[len("https://api-gw.onebound.cn"):]
	}
	defer func() { buildWanbangURL = original }()
	result := Product(context.Background(), db, "local", map[string]any{"platform": "jd", "url": "10235916959245"}, "key", "secret", server.Client())
	body := mustJSON(t, result.Body)
	if result.Status != http.StatusOK || strings.Contains(body, "未返回有效的商品图片") || !strings.Contains(body, `"title":"京东测试商品"`) {
		t.Fatalf("status %d body %s", result.Status, body)
	}
	if !strings.Contains(body, "41ed23e1642bd846.jpg") || !strings.Contains(body, "d7bb1d6573c8dd24.jpg") {
		t.Fatalf("images %s", body)
	}
}

func TestWanbangFailureMapsUpstreamCodes(t *testing.T) {
	cases := []struct {
		code, text string
	}{
		{"4000", "万邦采集接口服务器异常，请稍后重试"},
		{"4001", "万邦采集接口网络异常，请稍后重试"},
		{"4002", "万邦采集接口访问目标站点失败，请稍后重试"},
		{"5000", "万邦采集接口返回未知错误，请稍后重试"},
	}
	for _, item := range cases {
		failure := wanbangFailure(map[string]any{"error_code": item.code, "error": "upstream"})
		if failure.error != item.text || failure.status != http.StatusBadGateway || failure.stop {
			t.Fatalf("%s %#v", item.code, failure)
		}
	}
	if wanbangReportedError("") || wanbangReportedError(" ok ") || wanbangReportedError("SUCCESS") || !wanbangReportedError("item-not-found") {
		t.Fatal("error text classification")
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
