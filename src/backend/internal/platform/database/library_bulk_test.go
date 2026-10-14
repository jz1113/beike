package database

import (
	"context"
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
