package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestClassifyAlbumsUpdatesGroupsAndRollsBackOfficial(t *testing.T) {
	db := openAlbumClassifyDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]'),
		('child','local','子类','jewelry',1,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name","sourceKey","productCategoryId","createdAt") VALUES
		('local-album','local','本地','local',NULL,'2026-01-01T00:00:00.000Z'),
		('official-album','official','官方','official',NULL,'2026-01-02T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","albumId","productCategoryIds","productSubcategory","isUniversal") VALUES
		('group','local','local-album','[]','手机','1'),
		('other','other','local-album','[]','保留','1')`); err != nil {
		t.Fatal(err)
	}
	jewelry := "jewelry"
	if _, err := ClassifyAlbums(context.Background(), db, "local", []string{"local-album"}, &jewelry); err != nil {
		t.Fatal(err)
	}
	assertAlbumCategory(t, db, "local-album", "jewelry")
	assertGroup(t, db, "group", `["jewelry"]`, false, "")
	assertGroup(t, db, "other", "[]", true, "保留")
	if _, err := db.Exec(`UPDATE "FullPromptAsset" SET "productSubcategory" = '手机' WHERE "id" = 'group'`); err != nil {
		t.Fatal(err)
	}
	if _, err := ClassifyAlbums(context.Background(), db, "local", []string{"local-album", "local-album"}, &jewelry); err != nil {
		t.Fatal(err)
	}
	assertGroup(t, db, "group", `["jewelry"]`, false, "手机")
	if _, err := ClassifyAlbums(context.Background(), db, "local", []string{"local-album", "official-album"}, &jewelry); err == nil || err.Error() != "官方图集不可修改" {
		t.Fatalf("official %v", err)
	}
	assertAlbumCategory(t, db, "local-album", "jewelry")
	child := "child"
	if _, err := ClassifyAlbums(context.Background(), db, "local", []string{"local-album"}, &child); err == nil || err.Error() != "请选择可用的商品大类" {
		t.Fatalf("child %v", err)
	}
	if _, err := ClassifyAlbums(context.Background(), db, "local", []string{"missing"}, &jewelry); err == nil || err.Error() != "图集不存在" {
		t.Fatalf("missing %v", err)
	}
}

func assertAlbumCategory(t *testing.T, db *sql.DB, id, category string) {
	t.Helper()
	var got string
	if err := db.QueryRow(`SELECT "productCategoryId" FROM "PromptAlbum" WHERE "id" = ?`, id).Scan(&got); err != nil || got != category {
		t.Fatalf("album %s category %s err %v", id, got, err)
	}
}

func assertGroup(t *testing.T, db *sql.DB, id, categories string, universal bool, subcategory string) {
	t.Helper()
	var gotCategories string
	var gotUniversal int
	var gotSubcategory sql.NullString
	if err := db.QueryRow(`SELECT "productCategoryIds", "isUniversal", "productSubcategory" FROM "FullPromptAsset" WHERE "id" = ?`, id).Scan(&gotCategories, &gotUniversal, &gotSubcategory); err != nil {
		t.Fatal(err)
	}
	if gotCategories != categories || (gotUniversal != 0) != universal || gotSubcategory.String != subcategory {
		t.Fatalf("group %s categories %s universal %d subcategory %#v", id, gotCategories, gotUniversal, gotSubcategory)
	}
}

func openAlbumClassifyDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenWrite(filepath.Join(t.TempDir(), "albums.db"))
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
	if _, err := db.Exec(`CREATE TABLE "FullPromptAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "albumId" TEXT,
		"productCategoryIds" TEXT NOT NULL, "productSubcategory" TEXT, "isUniversal" INTEGER NOT NULL, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	return db
}
