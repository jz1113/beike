package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestSaveCollectedProductUpdatesSameItem(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "products.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "Product" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "platform" TEXT NOT NULL, "itemId" TEXT,
		"title" TEXT, "picUrl" TEXT, "detailUrls" TEXT, "createdAt" TEXT NOT NULL,
		UNIQUE ("workspaceId", "platform", "itemId")
	)`); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	first, err := SaveCollectedProduct(ctx, db, "local", "jd", "1", "旧标题", "https://img.alicdn.com/a.jpg", []string{"https://img.alicdn.com/a.jpg"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := SaveCollectedProduct(ctx, db, "local", "jd", "1", "新标题", "", []string{"https://img.alicdn.com/b.jpg"})
	if err != nil {
		t.Fatal(err)
	}
	if second["id"] != first["id"] || second["title"] != "新标题" || second["picUrl"] != "https://img.alicdn.com/a.jpg" {
		t.Fatalf("updated %#v", second)
	}
}

func TestDeleteProductRemovesRowAndLocalFile(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "products.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "Product" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "platform" TEXT NOT NULL, "itemId" TEXT,
		"title" TEXT, "picUrl" TEXT, "detailUrls" TEXT, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	file := filepath.Join(root, "azhuo", "images", "a.jpg")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("img"), 0o644); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("no"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "Product" ("id","workspaceId","platform","itemId","title","picUrl","detailUrls","createdAt") VALUES
		('mine','local','jd','1','商品','/storage/azhuo/images/a.jpg?sig=1','["/storage/azhuo/images/a.jpg","https://img.example/a.jpg"]','2026-01-01T00:00:00.000Z'),
		('other','elsewhere','jd','1','别人','/storage/azhuo/images/a.jpg','[]','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if err := DeleteProduct(context.Background(), db, "local", "mine", root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("本地商品图应被删除")
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Product" WHERE "id" = 'mine'`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("deleted %d err %v", count, err)
	}
	if err := DeleteProduct(context.Background(), db, "local", "other", root); err != ErrProductMissing {
		t.Fatalf("other workspace %v", err)
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal(err)
	}
}

func TestMergeProductDetailPreservesOwnershipMetadataAndBestURL(t *testing.T) {
	small := "https://img13.360buyimg.com/n5/jfs/t1/a.webp"
	large := "https://img14.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp"
	old := `{"main":[],"skus":["` + small + `"],"details":["https://img.alicdn.com/detail.webp"],"category":"鞋包","props":{"材质":"皮革"},"variantMetadata":{"version":1,"variants":[{"id":"1:2","label":"未知","skuIds":[],"imageUrls":["` + small + `"]}]}}`
	incoming := `{"main":["` + large + `","https://img.alicdn.com/detail.webp","https://img.alicdn.com/new.webp"],"skus":[],"details":[],"variantMetadata":null}`
	merged := mergeProductDetail(old, incoming)
	var parsed map[string]any
	if err := json.Unmarshal([]byte(merged), &parsed); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(parsed["main"], []any{"https://img.alicdn.com/new.webp"}) || !reflect.DeepEqual(parsed["skus"], []any{large}) || !reflect.DeepEqual(parsed["details"], []any{"https://img.alicdn.com/detail.webp"}) || parsed["category"] != "鞋包" || parsed["props"] == nil {
		t.Fatalf("detail overwritten %s", merged)
	}
	metadata := ReadProductVariantMetadata(parsed["variantMetadata"])
	if metadata == nil || !reflect.DeepEqual(metadata.Variants[0].ImageURLs, []string{large}) {
		t.Fatalf("metadata URL stale %s", merged)
	}
	for _, invalid := range []string{"", "bad", "null", `{"variantMetadata":{"version":99}}`} {
		if !json.Valid([]byte(mergeProductDetail(merged, invalid))) {
			t.Fatalf("malformed update destroyed detail: %q", invalid)
		}
		var again map[string]any
		_ = json.Unmarshal([]byte(mergeProductDetail(merged, invalid)), &again)
		if ReadProductVariantMetadata(again["variantMetadata"]) == nil {
			t.Fatalf("malformed update removed variants: %q", invalid)
		}
	}
}

func TestMergeProductDetailKeepsLegacyList(t *testing.T) {
	merged := mergeProductDetail(`["https://img.alicdn.com/old.webp"]`, `{"main":["https://img.alicdn.com/new.webp"]}`)
	var parsed struct{ Main []string }
	if err := json.Unmarshal([]byte(merged), &parsed); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(parsed.Main, []string{"https://img.alicdn.com/old.webp", "https://img.alicdn.com/new.webp"}) {
		t.Fatalf("lost legacy images %s", merged)
	}
}

func TestCleanProductImagesSharesQualityOwnershipAndCount(t *testing.T) {
	small := "https://img14.360buyimg.com/n0/s60x60_jfs/t1/a.webp"
	large := "https://img13.360buyimg.com/n0/s2000x2000_jfs/t1/a.webp"
	raw := `{"main":["` + small + `","/uploads/user.png"],"skus":["` + large + `","/uploads/user.png"],"details":["https://img.pddpic.com/native.webp","https://cdn.example.com/a.jpg?w=80"],"price":12}`
	cleaned, count := cleanDetailURLs(raw)
	if count != 3 {
		t.Fatalf("count = %d, cleaned = %v", count, cleaned)
	}
	var groups struct {
		Main, Skus, Details []string
		Price               int
	}
	if err := json.Unmarshal([]byte(cleaned.(string)), &groups); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(groups.Main, []string{large, "/uploads/user.png"}) || len(groups.Skus) != 0 || !reflect.DeepEqual(groups.Details, []string{"https://img.pddpic.com/native.webp"}) || groups.Price != 12 {
		t.Fatalf("unexpected groups: %#v", groups)
	}
	if cover := cleanProductCover(small, cleaned); cover != large {
		t.Fatalf("cover = %s, want %s", cover, large)
	}
	if cover := cleanProductCover("/uploads/user.png", cleaned); cover != "/uploads/user.png" {
		t.Fatalf("user cover changed: %s", cover)
	}
}

func TestCleanProductImagesPreservesLocalMaterials(t *testing.T) {
	raw := `{"main":["data:image/png;base64,YQ==","blob:https://example.com/user","/uploads/native.webp"],"skus":[],"details":["/uploads/native.webp"]}`
	cleaned, count := cleanDetailURLs(raw)
	if count != 3 {
		t.Fatalf("count = %d, cleaned = %v", count, cleaned)
	}
	again, againCount := cleanDetailURLs(cleaned)
	if again != cleaned || againCount != count {
		t.Fatalf("not idempotent: %v / %v", cleaned, again)
	}
}
