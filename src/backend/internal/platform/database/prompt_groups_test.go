package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestMovePromptGroupsSharesAlbumCategory(t *testing.T) {
	db := openPromptGroupDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]'),
		('prompt_subcategory:custom','local','定制','jewelry',1,0,'[]','[]','[]'),
		('prompt_subcategory:digital_3c:phone','local','手机本体','digital_3c',2,1,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name","sourceKey","productCategoryId","createdAt") VALUES
		('album','local','图集','album',NULL,'2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","albumId","productCategoryIds","productSubcategory","isUniversal","updatedAt") VALUES
		('selected','local','album','[]','旧细分',1,NULL),
		('sibling','local','album','[]','旧细分',1,NULL),
		('official','official','album','[]',NULL,0,NULL)`); err != nil {
		t.Fatal(err)
	}
	jewelry := "jewelry"
	folder := "prompt_subcategory:custom"
	result, err := MovePromptGroups(context.Background(), db, "local", []string{"selected"}, &jewelry, &folder)
	if err != nil {
		t.Fatal(err)
	}
	if result.MovedCount != 1 || result.AffectedCount != 3 {
		t.Fatalf("counts moved %d affected %d", result.MovedCount, result.AffectedCount)
	}
	assertAlbumCategory(t, db, "album", "jewelry")
	assertGroup(t, db, "selected", `["jewelry"]`, false, folder)
	assertGroup(t, db, "sibling", `["jewelry"]`, false, "")
	assertGroup(t, db, "official", "[]", false, "")
	phone := "phone"
	if _, err := MovePromptGroups(context.Background(), db, "local", []string{"selected"}, &jewelry, &phone); err == nil || err.Error() != "数码细分只能用于手机数码" {
		t.Fatalf("phone %v", err)
	}
	if _, err := MovePromptGroups(context.Background(), db, "local", []string{"official"}, &jewelry, nil); err == nil || err.Error() != "官方母组不可移动" {
		t.Fatalf("official %v", err)
	}
	assertGroup(t, db, "selected", `["jewelry"]`, false, folder)
}

func openPromptGroupDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenWrite(filepath.Join(t.TempDir(), "groups.db"))
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
