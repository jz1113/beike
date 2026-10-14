package database

import (
	"context"
	"strings"
	"testing"
)

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
