package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
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
