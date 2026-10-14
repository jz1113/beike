package catalog

import (
	"path/filepath"

	"beike.local/cloud/src/backend/internal/platform/database"
	"database/sql"
	"testing"
)

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

func openOrganizationDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "organization.db"))
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
	return db
}
