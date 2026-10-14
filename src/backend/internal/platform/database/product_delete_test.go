package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestDeleteProductRemovesRowAndLocalFile(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "products.db"))
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
