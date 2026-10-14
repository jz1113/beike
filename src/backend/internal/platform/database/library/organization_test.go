package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestListAssetOrganizationMarksReadOnly(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "organization.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "parentId" TEXT,
		"position" INTEGER NOT NULL, "isArchived" INTEGER NOT NULL, "aliases" TEXT NOT NULL,
		"keywords" TEXT NOT NULL, "anatomy" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
		"productCategoryId" TEXT, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('local-root','local','本地大类',NULL,1,0,'[]','[]','[]'),
		('local-child','local','本地子类','local-root',0,0,'[]','[]','[]'),
		('orphan','local','缺少父级','missing',2,0,'[]','[]','[]'),
		('archived-parent','local','已归档',NULL,3,1,'[]','[]','[]'),
		('archived-child','local','归档子类','archived-parent',4,0,'[]','[]','[]'),
		('official-root','official','官方',NULL,5,0,'[]','[]','[]'),
		('foreign','other','其他',NULL,6,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name","sourceKey","productCategoryId","createdAt") VALUES
		('older','local','旧图集','old',NULL,'2026-01-01T00:00:00.000Z'),
		('newer','official','新图集','new','local-root','2026-02-01T00:00:00.000Z'),
		('foreign-album','other','别人的','x',NULL,'2026-03-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	result, err := ListAssetOrganization(context.Background(), db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Categories) != 6 || result.Categories[0].ID != "local-child" {
		t.Fatalf("categories %#v", result.Categories)
	}
	readonly := map[string]bool{}
	for _, category := range result.Categories {
		readonly[category.ID] = category.IsReadOnly
	}
	if readonly["local-root"] || readonly["local-child"] || !readonly["orphan"] || !readonly["archived-child"] || !readonly["official-root"] {
		t.Fatalf("readonly %#v", readonly)
	}
	if len(result.Albums) != 2 || result.Albums[0].ID != "newer" || result.Albums[0].CreatedAt != "2026-02-01T00:00:00.000Z" || result.Albums[0].ProductCategoryID == nil {
		t.Fatalf("albums %#v", result.Albums)
	}
}

func TestReorderProductCategories(t *testing.T) {
	db := openOrganizationDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('a','local','甲',NULL,5,0,'[]','[]','[]'),
		('b','local','乙',NULL,6,0,'[]','[]','[]'),
		('child','local','子类','a',9,0,'[]','[]','[]'),
		('official','official','官方',NULL,1,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := ReorderProductCategories(context.Background(), db, "local", nil, []string{"b", "a", "official"}); err == nil {
		t.Fatal("包含官方同级品类时排序应失败并回滚")
	}
	var position int
	if err := db.QueryRow(`SELECT "position" FROM "AssetProductCategory" WHERE "id" = 'a'`).Scan(&position); err != nil || position != 5 {
		t.Fatalf("position %d err %v", position, err)
	}
	parent := "a"
	result, err := ReorderProductCategories(context.Background(), db, "local", &parent, []string{"child"})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT "position" FROM "AssetProductCategory" WHERE "id" = 'child'`).Scan(&position); err != nil || position != 0 {
		t.Fatalf("child position %d err %v", position, err)
	}
	if len(result.Categories) == 0 {
		t.Fatal("排序成功后应返回组织视图")
	}
}

func openOrganizationDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "organization.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "parentId" TEXT,
		"position" INTEGER NOT NULL, "isArchived" INTEGER NOT NULL, "aliases" TEXT NOT NULL,
		"keywords" TEXT NOT NULL, "anatomy" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
		"productCategoryId" TEXT, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	return db
}
