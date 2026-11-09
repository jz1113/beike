package library

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestBulkImportLibraryRemapsScenes(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL DEFAULT '',
		"parentId" TEXT, "position" INTEGER NOT NULL DEFAULT 0, "isArchived" INTEGER NOT NULL DEFAULT 0,
		"aliases" TEXT NOT NULL DEFAULT '[]', "keywords" TEXT NOT NULL DEFAULT '[]', "anatomy" TEXT NOT NULL DEFAULT '[]'
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
		"sourceKey" TEXT NOT NULL, "productCategoryId" TEXT, "createdAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId") VALUES ('jewelry','local')`); err != nil {
		t.Fatal(err)
	}
	imported, err := BulkImportLibrary(context.Background(), db, "local", []any{
		map[string]any{
			"assetType": "action", "sourceId": "pose",
			"data": map[string]any{"title": "侧颜", "action": "回眸", "shotType": "half_body", "sceneId": "room", "productCategoryIds": `["missing","jewelry"]`},
		},
		map[string]any{
			"assetType": "scene", "sourceId": "room",
			"data": map[string]any{"title": "窗边", "description": "安静", "lighting": "自然光", "albumId": "old-album"},
		},
	}, nil, nil, nil, nil)
	if err != nil || len(imported.Items) != 2 || !strings.Contains(string(imported.Items[0]), `"title":"窗边"`) {
		t.Fatalf("items %#v %v", imported.Items, err)
	}
	var sceneID, actionScene, categories string
	if err := db.QueryRow(`SELECT "id" FROM "SceneAsset"`).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT "sceneId", "productCategoryIds" FROM "ActionAsset"`).Scan(&actionScene, &categories); err != nil {
		t.Fatal(err)
	}
	if actionScene != sceneID || categories != `["jewelry"]` {
		t.Fatalf("action scene %s categories %s", actionScene, categories)
	}
	joined := strings.Join(imported.Warnings, "\n")
	if !strings.Contains(joined, "备份不含资产审核记录") || !strings.Contains(joined, "无法映射") || strings.Contains(joined, "图集关联无法恢复") {
		t.Fatalf("warnings %#v", imported.Warnings)
	}
	var albumID, sceneAlbum string
	if err := db.QueryRow(`SELECT "id" FROM "PromptAlbum"`).Scan(&albumID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT "albumId" FROM "SceneAsset"`).Scan(&sceneAlbum); err != nil || sceneAlbum != albumID {
		t.Fatalf("scene album %s prompt album %s %v", sceneAlbum, albumID, err)
	}
}

func TestBulkImportLibraryKeepsPersonaAvatar(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "PersonaAsset", personaAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	imported, err := BulkImportLibrary(context.Background(), db, "local", []any{
		map[string]any{
			"assetType": "persona",
			"data": map[string]any{
				"name": "清纯博主", "avatarUrl": "/storage/azhuo/a.jpg", "isUniversal": true,
				"productCategoryIds": `["missing"]`,
			},
		},
	}, nil, nil, nil, nil)
	if err != nil || len(imported.Items) != 1 || !strings.Contains(string(imported.Items[0]), `"name":"清纯博主"`) || !strings.Contains(string(imported.Items[0]), `"avatarUrl":"/storage/azhuo/a.jpg"`) || !strings.Contains(string(imported.Items[0]), `"isUniversal":true`) || !strings.Contains(string(imported.Items[0]), `"productCategoryIds":"[]"`) {
		t.Fatalf("persona %#v %v", imported.Items, err)
	}
}

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

func TestBulkImportLibraryAssignsPromptNumber(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "FullPromptAsset", fullPromptAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
		"sourceKey" TEXT NOT NULL, "productCategoryId" TEXT, "createdAt" TEXT,
		UNIQUE ("workspaceId", "sourceKey")
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptDisplaySequence" ("id" TEXT PRIMARY KEY, "lastNumber" INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptLibraryNumber" (
		"workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "displayNumber" INTEGER NOT NULL,
		"legacyDisplayNumber" INTEGER, PRIMARY KEY ("workspaceId", "assetId")
	)`); err != nil {
		t.Fatal(err)
	}
	imported, err := BulkImportLibrary(context.Background(), db, "local", []any{
		map[string]any{
			"assetType": "full_prompt",
			"data": map[string]any{
				"title": "导入母组", "albumName": "导入图集", "provenance": "manual",
				"reversePromptZh": "中文提示", "displayNumber": jsonNumberValue(99),
			},
		},
	}, nil, nil, nil, nil)
	if err != nil || len(imported.Items) != 1 || !strings.Contains(string(imported.Items[0]), `"title":"导入母组"`) || !strings.Contains(string(imported.Items[0]), `"displayNumber":1`) || !strings.Contains(string(imported.Items[0]), `"albumName":"导入图集"`) {
		t.Fatalf("prompt %#v %v", imported.Items, err)
	}
	var stored int
	if err := db.QueryRow(`SELECT "displayNumber" FROM "FullPromptAsset"`).Scan(&stored); err != nil || stored != 1 {
		t.Fatalf("stored %d %v", stored, err)
	}
}

func jsonNumberValue(value int) any {
	return value
}

func TestBulkImportLibraryRestoresRegistryAndReplacement(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "FullPromptAsset", fullPromptAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" ("id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
		"sourceKey" TEXT NOT NULL, "productCategoryId" TEXT, "createdAt" TEXT,
		UNIQUE ("workspaceId", "sourceKey")
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptDisplaySequence" ("id" TEXT PRIMARY KEY, "lastNumber" INTEGER NOT NULL)`); err != nil {
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
		"createdAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"motherAssetId" TEXT, "workspaceId" TEXT NOT NULL, "reviewId" TEXT NOT NULL,
		"sourceSnapshotJson" TEXT NOT NULL, "generatedImagesJson" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	imported, err := BulkImportLibrary(context.Background(), db, "local", []any{
		map[string]any{"assetType": "scene", "sourceId": "room", "data": map[string]any{"title": "窗边", "description": "安静", "lighting": "自然光"}},
		map[string]any{"assetType": "full_prompt", "sourceId": "group", "data": map[string]any{"title": "母组", "provenance": "manual", "reversePromptZh": "提示"}},
	}, []any{
		map[string]any{"id": "reg-room", "assetType": "scene", "sourceAssetId": "room", "status": "published", "version": 1, "provenance": "manual", "sourceRef": "missing-reg"},
		map[string]any{"id": "reg-gone", "assetType": "scene", "sourceAssetId": "absent", "status": "draft", "version": 1, "provenance": "manual"},
	}, []any{
		map[string]any{"motherAssetId": "group", "sourceSnapshotJson": `{"kept":true}`, "generatedImagesJson": `["a","b","c","d"]`, "createdAt": "2026-01-01T00:00:00.000Z"},
		map[string]any{"motherAssetId": "absent", "sourceSnapshotJson": `{"kept":true}`, "generatedImagesJson": `["a","b","c","d"]`, "createdAt": "2026-01-01T00:00:00.000Z"},
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var sourceID string
	var sourceRef sql.NullString
	if err := db.QueryRow(`SELECT "sourceAssetId", "sourceRef" FROM "PromptAssetRegistry"`).Scan(&sourceID, &sourceRef); err != nil {
		t.Fatal(err)
	}
	var sceneID string
	if err := db.QueryRow(`SELECT "id" FROM "SceneAsset"`).Scan(&sceneID); err != nil {
		t.Fatal(err)
	}
	if sourceID != sceneID || sourceRef.Valid {
		t.Fatalf("registry source %s ref %#v scene %s", sourceID, sourceRef, sceneID)
	}
	var reviewID string
	if err := db.QueryRow(`SELECT "reviewId" FROM "FullPromptImageReplacement"`).Scan(&reviewID); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(reviewID, "restored_") {
		t.Fatalf("review %s", reviewID)
	}
	joined := strings.Join(imported.Warnings, "\n")
	if !strings.Contains(joined, "审核记录未找到对应导入资产") || !strings.Contains(joined, "来源母本未包含在备份中") || !strings.Contains(joined, "母组换图记录未找到对应导入资产") {
		t.Fatalf("warnings %#v", imported.Warnings)
	}
}
