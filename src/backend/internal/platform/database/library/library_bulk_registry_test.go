package library

import (
	"context"
	"strings"
	"testing"

	"database/sql"
)

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
