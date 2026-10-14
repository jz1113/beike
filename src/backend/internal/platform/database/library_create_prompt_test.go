package database

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestCreateFullPromptReusesAlbumAndHidesSingleNumber(t *testing.T) {
	db := openPromptCreateDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId","isArchived") VALUES ('digital_3c','local',NULL,0)`); err != nil {
		t.Fatal(err)
	}
	item, err := CreateLibraryAsset(context.Background(), db, "local", "full_prompt", map[string]any{
		"albumName":    " 手机壳图集 ",
		"sourceImages": `["https://example.com/a.jpg"]`,
		"title":        "透明手机壳",
	})
	if err != nil || !strings.Contains(string(item), `"title":"透明手机壳"`) || !strings.Contains(string(item), `"displayNumber":null`) || !strings.Contains(string(item), `"productSubcategory":"case"`) {
		t.Fatalf("create %s %v", item, err)
	}
	var stored int
	var albumCategory string
	if err := db.QueryRow(`SELECT "displayNumber" FROM "FullPromptAsset"`).Scan(&stored); err != nil || stored != 1 {
		t.Fatalf("stored number %d %v", stored, err)
	}
	if err := db.QueryRow(`SELECT "productCategoryId" FROM "PromptAlbum"`).Scan(&albumCategory); err != nil || albumCategory != "digital_3c" {
		t.Fatalf("album %s %v", albumCategory, err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "full_prompt", map[string]any{
		"albumName": "手机壳图集", "sourceImages": `["https://example.com/a.jpg"]`, "title": "第二组",
	}); err != nil {
		t.Fatal(err)
	}
	var albums int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "PromptAlbum"`).Scan(&albums); err != nil || albums != 1 {
		t.Fatalf("albums %d %v", albums, err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "full_prompt", map[string]any{"albumId": "missing"}); err == nil || err.Error() != "请求的资源不存在" {
		t.Fatalf("missing album %v", err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "full_prompt", map[string]any{"productCategoryIds": `["a","b"]`}); err == nil || err.Error() != "完整提示词只能归属一个商品品类" {
		t.Fatalf("two categories %v", err)
	}
}

func TestCreateManualPromptPublishesLibraryNumber(t *testing.T) {
	db := openPromptCreateDB(t)
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name","sourceKey") VALUES ('album','local','已有图集','key')`); err != nil {
		t.Fatal(err)
	}
	item, err := CreateLibraryAsset(context.Background(), db, "local", "full_prompt", map[string]any{
		"albumId": "album", "provenance": "manual", "title": "手写母组",
	})
	if err != nil || !strings.Contains(string(item), `"displayNumber":1`) || !strings.Contains(string(item), `"title":"手写母组"`) {
		t.Fatalf("manual %s %v", item, err)
	}
	var provenance string
	if err := db.QueryRow(`SELECT "provenance" FROM "PromptAssetRegistry"`).Scan(&provenance); err != nil || provenance != "manual" {
		t.Fatalf("registry %s %v", provenance, err)
	}
}

func openPromptCreateDB(t *testing.T) *sql.DB {
	t.Helper()
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "FullPromptAsset", fullPromptAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "parentId" TEXT, "isArchived" INTEGER NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
		"sourceKey" TEXT NOT NULL, "productCategoryId" TEXT, "createdAt" TEXT,
		UNIQUE ("workspaceId", "sourceKey")
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptDisplaySequence" (
		"id" TEXT PRIMARY KEY, "lastNumber" INTEGER NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptLibraryNumber" (
		"workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "displayNumber" INTEGER NOT NULL,
		"legacyDisplayNumber" INTEGER, PRIMARY KEY ("workspaceId", "assetId")
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAssetRegistry" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "assetType" TEXT, "sourceAssetId" TEXT,
		"status" TEXT, "version" INTEGER, "provenance" TEXT, "sourceRef" TEXT,
		"qualityScore" REAL, "confidence" REAL, "publishedAt" TEXT, "disabledReason" TEXT,
		"createdAt" TEXT, "updatedAt" TEXT,
		UNIQUE ("workspaceId", "assetType", "sourceAssetId")
	)`); err != nil {
		t.Fatal(err)
	}
	return db
}
