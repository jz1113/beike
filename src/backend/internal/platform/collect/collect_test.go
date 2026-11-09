package collect

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/database/catalog"
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
	server.Close()
	shared := Product(context.Background(), db, "another-workspace", map[string]any{"platform": "jd", "url": "1234567"}, "", "", nil)
	if shared.Status != http.StatusOK || !strings.Contains(mustJSON(t, shared.Body), `"fromCache":true`) {
		t.Fatalf("expected shared cache without credentials: %#v", shared.Body)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Product" WHERE "workspaceId" = 'another-workspace'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("workspace copy %d %v", count, err)
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
	if _, err := db.Exec(`CREATE TABLE "CollectionCache" ("key" TEXT PRIMARY KEY, "payload" TEXT NOT NULL, "expiresAt" INTEGER NOT NULL)`); err != nil {
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

func resultImages(t *testing.T, result Result) imagePayload {
	t.Helper()
	var envelope struct {
		Images imagePayload `json:"images"`
	}
	if err := json.Unmarshal([]byte(mustJSON(t, result.Body)), &envelope); err != nil {
		t.Fatal(err)
	}
	return envelope.Images
}

func TestCollectFullResponseCacheAndForceRefreshCallCounts(t *testing.T) {
	db := openCollectDB(t)
	var calls atomic.Int32
	cacheFlags := make(chan string, 3)
	values := []string{}
	for i := 0; i < 40; i++ {
		values = append(values, fmt.Sprintf("//img.alicdn.com/main-%02d.webp", i))
	}
	payload := map[string]any{"error_code": "0000", "error": "", "item": map[string]any{
		"title": "测试商品", "pic_url": values[0], "item_imgs": values,
		"prop_imgs": []string{values[0], "//img.alicdn.com/sku.webp"},
		"desc_img":  []string{values[0], "//img.alicdn.com/sku.webp", "//img.alicdn.com/detail.webp"},
		"desc":      `<IMG DATA-ORIGINAL=//img.alicdn.com/html-detail.webp>`,
	}}
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		cacheFlags <- r.URL.Query().Get("cache")
		if r.URL.Path != "/jd/item_get_pro/" || r.URL.Query().Has("domain_type") {
			t.Errorf("unexpected extra/malformed paid method: %s", r.URL)
		}
		_ = json.NewEncoder(w).Encode(payload)
	})
	fresh := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	images := resultImages(t, fresh)
	if fresh.Status != 200 || len(images.Main) != 40 || len(images.Skus) != 1 || len(images.Details) != 2 || calls.Load() != 1 {
		t.Fatalf("status=%d calls=%d images=%#v", fresh.Status, calls.Load(), images)
	}
	cached := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", client)
	if cached.Status != 200 || !strings.Contains(mustJSON(t, cached.Body), `"fromCache":true`) || calls.Load() != 1 || !reflect.DeepEqual(resultImages(t, cached), images) {
		t.Fatalf("cache changed groups or billed again: %#v calls=%d", cached, calls.Load())
	}
	for _, forceName := range []string{"forceRefresh", "force_refresh"} {
		refreshed := Product(context.Background(), db, "local", map[string]any{"url": "1234567", forceName: true}, "test-key", "test-secret", client)
		if refreshed.Status != 200 || !reflect.DeepEqual(resultImages(t, refreshed), images) {
			t.Fatalf("force result %#v", refreshed)
		}
	}
	if calls.Load() != 3 {
		t.Fatalf("calls=%d", calls.Load())
	}
	flags := []string{<-cacheFlags, <-cacheFlags, <-cacheFlags}
	if !reflect.DeepEqual(flags, []string{"yes", "no", "no"}) {
		t.Fatalf("flags=%#v", flags)
	}
	var rows int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Product" WHERE "itemId"='1234567'`).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("force refresh duplicated rows: %d err=%v", rows, err)
	}
}

func TestCollectSKUOnlyCoverStaysSKUAfterCache(t *testing.T) {
	db := openCollectDB(t)
	var calls atomic.Int32
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = io.WriteString(w, `{"error_code":"0000","item":{"title":"只有SKU图片","skus":{"sku":[{"pic_url":"//img.alicdn.com/sku.webp"}]}}}`)
	})
	fresh := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "test-key", "test-secret", client)
	cached := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", client)
	for _, result := range []Result{fresh, cached} {
		images := resultImages(t, result)
		if result.Status != 200 || len(images.Main) != 0 || !reflect.DeepEqual(images.Skus, []string{"https://img.alicdn.com/sku.webp"}) {
			t.Fatalf("SKU cover moved into main: %#v", result)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("unexpected paid calls %d", calls.Load())
	}
}

func TestCollectLegacyCacheUsesSameDedupAndUpgradeRules(t *testing.T) {
	db := openCollectDB(t)
	detail := `{"main":["https://img13.360buyimg.com/n5/jfs/t1/a.webp?sign=small"],"skus":["https://img14.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=large%2fb&part=+","https://img.alicdn.com/b.jpg_50x50.jpg"],"details":["https://img.alicdn.com/b.jpg","https://img.alicdn.com/detail.webp"],"props":{}}`
	if _, err := db.Exec(`INSERT INTO "Product" ("id","workspaceId","platform","itemId","title","picUrl","detailUrls","createdAt") VALUES ('cached','local','jd','1234567','缓存商品','https://img.alicdn.com/b.jpg',?,'2026-01-01')`, detail); err != nil {
		t.Fatal(err)
	}
	result := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", nil)
	images := resultImages(t, result)
	if result.Status != 200 || !reflect.DeepEqual(images.Main, []string{"https://img14.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=large%2fb&part=+"}) || !reflect.DeepEqual(images.Skus, []string{"https://img.alicdn.com/b.jpg"}) || !reflect.DeepEqual(images.Details, []string{"https://img.alicdn.com/detail.webp"}) {
		t.Fatalf("cache groups %#v status=%d", images, result.Status)
	}
}

func TestCollectForceRefreshValidationAndMissingCredentialNeverBills(t *testing.T) {
	db := openCollectDB(t)
	if _, err := db.Exec(`INSERT INTO "Product" ("id","workspaceId","platform","itemId","title","picUrl","detailUrls","createdAt") VALUES ('cached','local','jd','1234567','缓存商品','https://img.alicdn.com/a.jpg','{"main":["https://img.alicdn.com/a.jpg"]}','2026-01-01')`); err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1) })
	for _, body := range []map[string]any{
		{"url": "1234567", "forceRefresh": true},
		{"url": "1234567", "force_refresh": true},
		{"url": "1234567", "forceRefresh": "true"},
	} {
		result := Product(context.Background(), db, "local", body, "", "", client)
		if result.Status != 400 || calls.Load() != 0 {
			t.Fatalf("invalid/missing credential unexpectedly billed: %#v calls=%d", result, calls.Load())
		}
	}
}

func TestExtractProductImagesAllFieldsAndStableOrder(t *testing.T) {
	item := map[string]any{
		"pic_url":   `"//img.alicdn.com/cover.jpg"`,
		"item_imgs": map[string]any{"item_img": []any{"https://img.alicdn.com/main2.jpg", map[string]any{"url": "jfs/t1/main3.webp"}}},
		"prop_imgs": map[string]any{"prop_img": []any{map[string]any{"url": "//img.alicdn.com/sku1.jpg", "sku_url": "https://item.jd.com/1234567.html", "shop_logo": "https://img.alicdn.com/shop.jpg"}}},
		"props_img": `{"123:456":"//img.alicdn.com/sku2.jpg","123:789":["//img.alicdn.com/sku3.jpg"]}`,
		"skus":      map[string]any{"sku": []any{map[string]any{"image": []any{`["//img.alicdn.com/sku4.jpg"]`}, "detail_url": "https://item.jd.com/7654321.html", "shop": map[string]any{"url": "//img.alicdn.com/shop2.jpg"}}}},
		"desc_img":  []any{"//img.alicdn.com/detail1.jpg", `[["//img.alicdn.com/detail2.jpg"]]`},
		"desc":      `<DIV><IMG SRC=//img.alicdn.com/detail3.jpg><img data-original="//img.alicdn.com/detail4.jpg" src="//img.alicdn.com/placeholder.jpg"></DIV>`,
		"shop_logo": "//img.alicdn.com/shop3.jpg", "url": "https://item.jd.com/1234567.html",
	}
	main, skus, details := extractProductImages(item)
	if !reflect.DeepEqual(main, []string{"https://img.alicdn.com/cover.jpg", "https://img.alicdn.com/main2.jpg", "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/main3.webp"}) ||
		!reflect.DeepEqual(skus, []string{"https://img.alicdn.com/sku1.jpg", "https://img.alicdn.com/sku2.jpg", "https://img.alicdn.com/sku3.jpg", "https://img.alicdn.com/sku4.jpg"}) ||
		!reflect.DeepEqual(details, []string{"https://img.alicdn.com/detail1.jpg", "https://img.alicdn.com/detail2.jpg", "https://img.alicdn.com/detail3.jpg", "https://img.alicdn.com/detail4.jpg"}) {
		t.Fatalf("groups main=%#v skus=%#v details=%#v", main, skus, details)
	}
	for i := 0; i < 20; i++ {
		m, s, d := extractProductImages(item)
		if !reflect.DeepEqual(m, main) || !reflect.DeepEqual(s, skus) || !reflect.DeepEqual(d, details) {
			t.Fatal("unstable extraction order")
		}
	}
}

func TestExtractProductHTMLTokenizerAndSourcePriority(t *testing.T) {
	cases := []struct{ source, want string }{
		{`<IMG SRC=//img.alicdn.com/a.jpg DATA-ORIGINAL="//img.alicdn.com/original.webp">`, "https://img.alicdn.com/original.webp"},
		{`&lt;IMG DATA-SRC=&quot;//img.alicdn.com/entity.jpg?sign=A%2fb&amp;amp;b=+&quot;&gt;`, "https://img.alicdn.com/entity.jpg?sign=A%2fb&b=+"},
		{`<img src="//img.alicdn.com/a.jpg" data-srcset="//img.alicdn.com/small.jpg 400w, //img.alicdn.com/large.webp 1600w">`, "https://img.alicdn.com/large.webp"},
		{`<img data-lazyload=//img.alicdn.com/lazy.jpg src=//img.alicdn.com/a.jpg>`, "https://img.alicdn.com/lazy.jpg"},
		{`<img srcset="//img.alicdn.com/a.jpg 1x,//img.alicdn.com/b.webp 2x" src="//img.alicdn.com/fallback.jpg">`, "https://img.alicdn.com/b.webp"},
		{`<img data-original="data:image/gif;base64,placeholder" data-src="//img.alicdn.com/valid.jpg">`, "https://img.alicdn.com/valid.jpg"},
		{`<img src="https://img.alicdn.com/a.jpg?sign=x%2Fy&amp;part=+&amp;part=%20">`, "https://img.alicdn.com/a.jpg?sign=x%2Fy&part=+&part=%20"},
		{`<img src=jfs/t1/raw.webp>`, "https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/t1/raw.webp"},
		{`<img data-original="https://img12.360buyimg.com/n0/s600x600_jfs/t1/a.webp?sign=small" srcset="https://img13.360buyimg.com/n0/s1600x1600_jfs/t1/a.webp?sign=large 1600w" src="//img.alicdn.com/placeholder.jpg">`, "https://img13.360buyimg.com/n0/s1600x1600_jfs/t1/a.webp?sign=large"},
	}
	for _, item := range cases {
		main, _, _ := productImageGroups(extractURLs(item.source, true), nil, nil)
		if !reflect.DeepEqual(main, []string{item.want}) {
			t.Fatalf("source %s got %#v want %s", item.source, main, item.want)
		}
	}
}

func TestExtractProductHasNoTwentyFourImageCap(t *testing.T) {
	values := []any{}
	for i := 0; i < 75; i++ {
		values = append(values, fmt.Sprintf("https://img.alicdn.com/image-%03d.jpg", i))
	}
	main, skus, details := extractProductImages(map[string]any{"item_imgs": values, "desc_img": values})
	if len(main) != 75 || len(skus) != 0 || len(details) != 0 || main[74] != "https://img.alicdn.com/image-074.jpg" {
		t.Fatalf("lost images: main=%d sku=%d details=%d", len(main), len(skus), len(details))
	}
}

func TestProductImageGroupsCrossGroupBestResolutionAndSignedBytes(t *testing.T) {
	small := "https://img13.360buyimg.com/n5/s50x50_jfs/t1/a.webp?sign=small%2fb"
	high := "https://img12.360buyimg.com/n0/s1200x1200_jfs/t1/a.webp?sign=large%2fb&part=+&part=%20"
	main, skus, details := productImageGroups(
		[]string{small, "https://img.alicdn.com/main.jpg_50x50.jpg", "https://cdn.example.com/80x80/unrecoverable.jpg"},
		[]string{high, "https://img.alicdn.com/sku.jpg_50x50.jpg?sign=small", "https://img.alicdn.com/main.jpg"},
		[]string{"https://img.alicdn.com/sku.jpg?sign=large", "https://img.alicdn.com/detail.jpg", "https://img.alicdn.com/main.jpg_800x800.jpg"},
	)
	if !reflect.DeepEqual(main, []string{high, "https://img.alicdn.com/main.jpg"}) || !reflect.DeepEqual(skus, []string{"https://img.alicdn.com/sku.jpg?sign=large"}) || !reflect.DeepEqual(details, []string{"https://img.alicdn.com/detail.jpg"}) {
		t.Fatalf("main=%#v skus=%#v details=%#v", main, skus, details)
	}
	main, skus, details = productImageGroups([]string{small}, nil, nil)
	if len(main)+len(skus)+len(details) != 0 {
		t.Fatalf("signed small was fabricated: %#v", main)
	}
}

func variantResult(t *testing.T, result Result) *catalog.ProductVariantMetadata {
	t.Helper()
	var body struct {
		Product struct {
			VariantMetadata *catalog.ProductVariantMetadata `json:"variantMetadata"`
		} `json:"product"`
	}
	if err := json.Unmarshal([]byte(mustJSON(t, result.Body)), &body); err != nil {
		t.Fatal(err)
	}
	return body.Product.VariantMetadata
}

func TestCollectVariantMappingFreshCacheAndGenericSaves(t *testing.T) {
	db := openCollectDB(t)
	small := "https://img13.360buyimg.com/n5/jfs/t1/shared.webp"
	large := "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/shared.webp"
	item := map[string]any{
		"title": "实物规格", "pic_url": small,
		"props_list": map[string]any{"1627207:1": "颜色:黑色", "1627207:2": "颜色:灰色"},
		"props_img":  map[string]any{"1627207:1": small, "1627207:2": small, "1627207:3": "//img.alicdn.com/unknown.webp"},
		"prop_imgs":  map[string]any{"prop_img": []any{map[string]any{"properties": "1627207:1", "url": large}}},
		"skus": map[string]any{"sku": []any{
			map[string]any{"sku_id": "1234567", "properties": "1627207:1;20509:10", "properties_name": "1627207:1:颜色:黑色;20509:10:尺码:M"},
			map[string]any{"sku_id": "1234568", "properties": "1627207:1;20509:11"},
			map[string]any{"sku_id": "1234569", "properties": "1627207:2"},
		}},
		"desc_img": []any{"//img.alicdn.com/detail.webp"},
	}
	calls := 0
	client := routeCollectServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{"item": item})
	})
	fresh := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "fake-key", "fake-secret", client)
	cached := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", client)
	actual := variantResult(t, fresh)
	if fresh.Status != 200 || cached.Status != 200 || calls != 1 || actual == nil || !reflect.DeepEqual(actual, variantResult(t, cached)) {
		t.Fatalf("fresh/cache diverged: %#v %#v calls=%d", fresh, cached, calls)
	}
	if len(actual.Variants) != 3 || actual.SelectedVariantID != "1627207:1" || actual.RequestedSKUID != "1234567" {
		t.Fatalf("metadata %#v", actual)
	}
	if !reflect.DeepEqual(actual.Variants[0].SKUIDs, []string{"1234567", "1234568"}) || !reflect.DeepEqual(actual.Variants[0].ImageURLs, []string{large}) || !reflect.DeepEqual(actual.Variants[1].ImageURLs, []string{large}) {
		t.Fatalf("SKU/shared image mapping %#v", actual.Variants)
	}
	if actual.Variants[2].Label != "未知" || actual.Variants[2].Color != "" || len(actual.Variants[2].SKUIDs) != 0 {
		t.Fatalf("invented unknown metadata %#v", actual.Variants[2])
	}
	// Saving a flattened list must retain both classification and metadata.
	images := resultImages(t, fresh)
	flat := append(append(append([]string{}, images.Main...), images.Skus...), images.Details...)
	saved, err := catalog.SaveCollectedProduct(context.Background(), db, "local", "jd", "1234567", "改标题", large, flat)
	if err != nil {
		t.Fatal(err)
	}
	update := `{"main":["` + large + `"]}`
	if _, err = catalog.UpdateProduct(context.Background(), db, "local", saved["id"].(string), nil, nil, nil, &update); err != nil {
		t.Fatal(err)
	}
	after := Product(context.Background(), db, "local", map[string]any{"url": "1234567"}, "", "", client)
	if !reflect.DeepEqual(variantResult(t, after), actual) || !reflect.DeepEqual(resultImages(t, after), images) || calls != 1 {
		t.Fatalf("save/update lost collected data: %#v", after)
	}
}

func TestVariantsDoNotGuessSelectionColorOrImageAssociation(t *testing.T) {
	item := map[string]any{
		"skuId": "1234567", "sku_id": "1234567", "pic_url": "//img.alicdn.com/main.webp",
		"props_img": map[string]any{"1:2": "//img.alicdn.com/a.webp"},
	}
	main, skus, details := extractProductImages(item)
	images := append(append(main, skus...), details...)
	metadata := extractProductVariants(item, productInput{platform: "jd", itemID: "1234567"}, images)
	if metadata.SelectedVariantID != "" || len(metadata.Variants) != 1 || metadata.Variants[0].Color != "" || len(metadata.Variants[0].SKUIDs) != 0 {
		t.Fatalf("guessed metadata %#v", metadata)
	}
	if !reflect.DeepEqual(metadata.Variants[0].ImageURLs, []string{"https://img.alicdn.com/a.webp"}) {
		t.Fatalf("main image guessed as SKU %#v", metadata)
	}
	metadata = extractProductVariants(map[string]any{"pic_url": "//img.alicdn.com/main.webp"}, productInput{platform: "taobao", itemID: "1234567"}, images)
	if len(metadata.Variants) != 0 || metadata.RequestedSKUID != "" || metadata.SelectedVariantID != "" {
		t.Fatalf("fabricated metadata %#v", metadata)
	}
}

func TestVariantExplicitSelectionAndChangedRequestedSKU(t *testing.T) {
	item := map[string]any{"props_img": `{"1:1":"//img.alicdn.com/a.webp","1:2":"//img.alicdn.com/b.webp"}`, "selected_sku_id": "1234568", "skus": map[string]any{"sku": []any{
		map[string]any{"sku_id": "1234567", "properties": "1:1"}, map[string]any{"sku_id": "1234568", "properties": "1:2"},
	}}}
	_, skus, _ := extractProductImages(item)
	metadata := extractProductVariants(item, productInput{platform: "taobao", itemID: "9999999"}, skus)
	if metadata.SelectedVariantID != "1:2" || metadata.RequestedSKUID != "" {
		t.Fatalf("explicit selection missing %#v", metadata)
	}
	changed := selectRequestedVariant(metadata, productInput{platform: "taobao", itemID: "9999999", requestedSKUID: "1234567"})
	if changed.SelectedVariantID != "1:1" || changed.RequestedSKUID != "1234567" || metadata.SelectedVariantID != "1:2" {
		t.Fatalf("cached selection stale %#v", changed)
	}
	parsed, message := resolveProductInput(map[string]any{"url": "https://item.taobao.com/item.htm?id=9999999&skuId=1234567"})
	if message != "" || parsed.requestedSKUID != "1234567" {
		t.Fatalf("request sku not retained %#v %s", parsed, message)
	}
}

func TestSKUSpecsKeepColorAndSizeAssociated(t *testing.T) {
	item := map[string]any{
		"props_list": map[string]any{"1:1": "颜色:杏色", "1:2": "颜色:黑色", "2:1": "尺码:均码"},
		"skus": map[string]any{"sku": []any{
			map[string]any{"sku_id": "1234567", "properties": "1:1;2:1"},
			map[string]any{"sku_id": "1234568", "properties_name": "1:2:颜色:黑色;2:2:尺码:L"},
		}},
	}
	want := map[string]map[string]string{
		"1234567": {"颜色": "杏色", "尺码": "均码"},
		"1234568": {"颜色": "黑色", "尺码": "L"},
	}
	if got := skuSpecs(item); !reflect.DeepEqual(got, want) {
		t.Fatalf("SKU specs = %#v, want %#v", got, want)
	}
}
