package collect

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
)

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
