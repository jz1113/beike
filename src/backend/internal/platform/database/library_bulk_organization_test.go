package database

import (
	"context"
	"strings"
	"testing"
)

func TestBulkImportLibraryRestoresCategoriesAndAlbums(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
		"parentId" TEXT, "position" INTEGER NOT NULL DEFAULT 0, "isArchived" INTEGER NOT NULL DEFAULT 0,
		"aliases" TEXT NOT NULL DEFAULT '[]', "keywords" TEXT NOT NULL DEFAULT '[]', "anatomy" TEXT NOT NULL DEFAULT '[]'
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
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","aliases","keywords","anatomy") VALUES ('jewelry','local','珠宝首饰','[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name","sourceKey") VALUES ('old','local','旧图集','same-key')`); err != nil {
		t.Fatal(err)
	}
	imported, err := BulkImportLibrary(context.Background(), db, "local", []any{
		map[string]any{
			"assetType": "scene", "sourceId": "room",
			"data": map[string]any{"title": "窗边", "description": "安静", "lighting": "自然光", "albumId": "album-new", "productCategoryIds": `["bag","missing"]`},
		},
	}, nil, nil, []any{
		map[string]any{"id": "jewelry", "name": "珠宝首饰", "position": 3, "aliases": "[]", "keywords": "[]", "anatomy": "[]"},
		map[string]any{"id": "bag", "name": "箱包", "parentId": "jewelry"},
	}, []any{
		map[string]any{"id": "album-new", "name": "新图集", "sourceKey": "same-key", "productCategoryId": "bag"},
		map[string]any{"id": "album-loose", "name": "独立图集"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var bagID, parentID string
	if err := db.QueryRow(`SELECT "id", "parentId" FROM "AssetProductCategory" WHERE "name" = '箱包'`).Scan(&bagID, &parentID); err != nil {
		t.Fatal(err)
	}
	if parentID != "jewelry" || bagID == "bag" {
		t.Fatalf("bag %s parent %s", bagID, parentID)
	}
	var sceneAlbum, categories string
	if err := db.QueryRow(`SELECT "albumId", "productCategoryIds" FROM "SceneAsset"`).Scan(&sceneAlbum, &categories); err != nil {
		t.Fatal(err)
	}
	if sceneAlbum == "" || sceneAlbum == "album-new" || categories != `["`+bagID+`"]` {
		t.Fatalf("scene album %s categories %s", sceneAlbum, categories)
	}
	var copied int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "PromptAlbum" WHERE "sourceKey" LIKE 'backup-copy:%'`).Scan(&copied); err != nil || copied != 1 {
		t.Fatalf("copied albums %d %v", copied, err)
	}
	joined := strings.Join(imported.Warnings, "\n")
	for _, text := range []string{"保留目标库排序", "来源标识已存在", "缺少来源标识", "无法映射"} {
		if !strings.Contains(joined, text) {
			t.Fatalf("warnings %#v missing %s", imported.Warnings, text)
		}
	}
}

func TestBulkImportLibraryRejectsCategoryShape(t *testing.T) {
	db := openLibraryUpdateDB(t)
	_, err := BulkImportLibrary(context.Background(), db, "local", []any{}, nil, nil, map[string]any{"id": "jewelry"}, nil)
	if err == nil || err.Error() != "备份商品品类格式无效" {
		t.Fatalf("error %v", err)
	}
}
