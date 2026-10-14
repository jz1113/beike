package database

import (
	"context"
	"strings"
	"testing"
)

func TestCreatePersonaKeepsOrganizationRules(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "PersonaAsset", personaAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
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
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId") VALUES
		('jewelry','official'), ('other','elsewhere')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId") VALUES ('album','official')`); err != nil {
		t.Fatal(err)
	}
	item, err := CreateLibraryAsset(context.Background(), db, "local", "persona", map[string]any{
		"productCategoryIds": `["jewelry","jewelry",""]`,
		"isUniversal":        true,
		"albumId":            "album",
	})
	if err != nil || !strings.Contains(string(item), `"name":"新人设博主"`) || !strings.Contains(string(item), `"productCategoryIds":"[\"jewelry\"]"`) || !strings.Contains(string(item), `"isUniversal":true`) || !strings.Contains(string(item), `"albumId":"album"`) {
		t.Fatalf("persona %s %v", item, err)
	}
	var assetType string
	if err := db.QueryRow(`SELECT "assetType" FROM "PromptAssetRegistry"`).Scan(&assetType); err != nil || assetType != "persona" {
		t.Fatalf("registry %s %v", assetType, err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "persona", map[string]any{"productCategoryIds": `["other"]`}); err == nil || err.Error() != "商品品类不存在" {
		t.Fatalf("missing category %v", err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "persona", map[string]any{"albumId": "gone"}); err == nil || err.Error() != "图集不存在" {
		t.Fatalf("missing album %v", err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "persona", map[string]any{"isUniversal": "true"}); err == nil || err.Error() != "通用标记必须为布尔值" {
		t.Fatalf("universal %v", err)
	}
}
