package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestClassifyAssetsUpdatesCurrentWorkspace(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "assets.db"))
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
	if _, err := db.Exec(`CREATE TABLE "SceneAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "productCategoryIds" TEXT NOT NULL, "isUniversal" INTEGER NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","productCategoryIds","isUniversal") VALUES
		('local','local','[]',0),
		('official','official','[]',0)`); err != nil {
		t.Fatal(err)
	}
	result, err := ClassifyAssets(context.Background(), db, "local", "scene_bundle", []string{"local", "official", "local"}, []string{"jewelry"}, true)
	if err != nil || len(result.Categories) != 1 {
		t.Fatalf("classify %v categories %d", err, len(result.Categories))
	}
	assertScene(t, db, "local", `["jewelry"]`, 1)
	assertScene(t, db, "official", "[]", 0)
	if _, err := ClassifyAssets(context.Background(), db, "local", "full_prompt", []string{"local"}, nil, false); err == nil || err.Error() != "完整提示词请按图集调整归属" {
		t.Fatalf("full prompt %v", err)
	}
	if _, err := ClassifyAssets(context.Background(), db, "local", "scene", []string{"missing"}, []string{"jewelry"}, false); err == nil || err.Error() != "素材不存在" {
		t.Fatalf("missing %v", err)
	}
	if _, err := ClassifyAssets(context.Background(), db, "local", "scene", []string{"local"}, []string{"gone"}, false); err == nil || err.Error() != "商品品类不存在" {
		t.Fatalf("category %v", err)
	}
}

func assertScene(t *testing.T, db *sql.DB, id, categories string, universal int) {
	t.Helper()
	var gotCategories string
	var gotUniversal int
	if err := db.QueryRow(`SELECT "productCategoryIds", "isUniversal" FROM "SceneAsset" WHERE "id" = ?`, id).Scan(&gotCategories, &gotUniversal); err != nil {
		t.Fatal(err)
	}
	if gotCategories != categories || gotUniversal != universal {
		t.Fatalf("scene %s categories %s universal %d", id, gotCategories, gotUniversal)
	}
}
