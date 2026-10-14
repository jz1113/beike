package database

import (
	"context"
	"strings"
	"testing"
)

func TestExportLibraryKeepsSharedRowsAndNumbers(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "OutfitAsset", outfitAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	createLibraryTable(t, db, "PersonaAsset", personaAssetColumns)
	createLibraryTable(t, db, "FullPromptAsset", fullPromptAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "parentId" TEXT,
		"position" INTEGER NOT NULL, "isArchived" INTEGER NOT NULL, "aliases" TEXT NOT NULL,
		"keywords" TEXT NOT NULL, "anatomy" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL,
		"sourceKey" TEXT NOT NULL, "productCategoryId" TEXT
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
		"motherAssetId" TEXT, "workspaceId" TEXT NOT NULL, "sourceSnapshotJson" TEXT NOT NULL,
		"generatedImagesJson" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title") VALUES
		('b','local','后'), ('a','local','前'), ('official','official','官方'), ('other','elsewhere','别人')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset"
		("id","workspaceId","title","provenance","groupIndex","displayNumber","createdAt") VALUES
		('group','local','母组','manual',1,9,'2026-01-01T00:00:00.000Z'),
		('old','local','旧单图','legacy_single',NULL,8,'2026-01-02T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry"
		("id","workspaceId","assetType","sourceAssetId","status","version","provenance","createdAt","updatedAt") VALUES
		('keep','local','scene','a','published',1,'manual','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
		('drop','local','scene','missing','published',1,'manual','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptImageReplacement"
		("motherAssetId","workspaceId","sourceSnapshotJson","generatedImagesJson","createdAt") VALUES
		('group','local','{}','[]','2026-01-01T00:00:00.000Z'),
		('old','elsewhere','{}','[]','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	exported, err := ExportLibrary(context.Background(), db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(exported.Scenes) != 3 || !strings.Contains(string(exported.Scenes[0]), `"id":"a"`) || strings.Contains(string(exported.Scenes[2]), "别人") {
		t.Fatalf("scenes %#v", exported.Scenes)
	}
	if len(exported.Categories) != 1 || strings.Contains(string(exported.Categories[0]), "workspaceId") || !strings.Contains(string(exported.Categories[0]), `"name":"珠宝"`) {
		t.Fatalf("categories %#v", exported.Categories)
	}
	if len(exported.FullPrompts) != 2 || !strings.Contains(string(exported.FullPrompts[0]), `"displayNumber":1`) || !strings.Contains(string(exported.FullPrompts[1]), `"displayNumber":null`) {
		t.Fatalf("prompts %#v", exported.FullPrompts)
	}
	if len(exported.Registries) != 1 || !strings.Contains(string(exported.Registries[0]), `"sourceAssetId":"a"`) {
		t.Fatalf("registries %#v", exported.Registries)
	}
	if len(exported.Replacements) != 1 || !strings.Contains(string(exported.Replacements[0]), `"motherAssetId":"group"`) {
		t.Fatalf("replacements %#v", exported.Replacements)
	}
}
