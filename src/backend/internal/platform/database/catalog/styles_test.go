package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
	"testing"
)

func TestListStyleRecipesHidesOfficialCopy(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "styles.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "StyleRecipe" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
		"tag" TEXT, "desc" TEXT, "promptSnippet" TEXT NOT NULL, "coverUrl" TEXT, "sampleImages" TEXT,
		"sourceUrl" TEXT, "isFavorite" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAssetUsageEvent" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "batchId" TEXT NOT NULL,
		"eventType" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "metadata" TEXT NOT NULL DEFAULT '{}'
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "StyleRecipe" ("id","workspaceId","name","category","promptSnippet","isFavorite","createdAt","updatedAt") VALUES
		('mine','local','我的','general','片段',1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
		('official-visible','official','官方可见','general','片段',0,'2026-01-02T00:00:00.000Z','2026-01-02T00:00:00.000Z'),
		('official-hidden','official','官方隐藏','general','片段',0,'2026-01-03T00:00:00.000Z','2026-01-03T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAssetUsageEvent" ("id","workspaceId","assetId","batchId","eventType","createdAt") VALUES
		('hide','local','official-hidden','recipe-library','recipe_hidden','2026-01-04T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	page, err := ListStyleRecipes(context.Background(), db, "local", "all", 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 || len(page.HiddenOfficialRecipes) != 1 || page.HiddenOfficialRecipes[0]["id"] != "official-hidden" {
		t.Fatalf("page %#v", page)
	}
	if page.Recipes[0]["id"] != "mine" || page.Recipes[0]["isOfficial"] != false {
		t.Fatalf("recipes %#v", page.Recipes)
	}
	if err := DeleteStyleRecipe(context.Background(), db, "local", "official-visible"); err != nil {
		t.Fatal(err)
	}
	var hidden int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "PromptAssetUsageEvent" WHERE "assetId" = 'official-visible' AND "eventType" = 'recipe_hidden'`).Scan(&hidden); err != nil || hidden != 1 {
		t.Fatalf("hidden %d err %v", hidden, err)
	}
	if err := DeleteStyleRecipe(context.Background(), db, "local", "mine"); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "StyleRecipe" WHERE "id" = 'mine'`).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatalf("remaining %d err %v", remaining, err)
	}
}

func TestRestoreOfficialStyleRecipe(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "restore.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "StyleRecipe" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
		"tag" TEXT, "desc" TEXT, "promptSnippet" TEXT NOT NULL, "coverUrl" TEXT, "sampleImages" TEXT,
		"sourceUrl" TEXT, "isFavorite" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAssetUsageEvent" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "batchId" TEXT NOT NULL,
		"eventType" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "metadata" TEXT NOT NULL DEFAULT '{}'
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "StyleRecipe" ("id","workspaceId","name","category","promptSnippet","createdAt","updatedAt") VALUES
		('official','official','官方','general','片段','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
		('mine','local','我的','general','片段','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if err := hideOfficialRecipe(context.Background(), db, "local", "official"); err != nil {
		t.Fatal(err)
	}
	status, err := RestoreOfficialStyleRecipe(context.Background(), db, "local", "official")
	if err != nil || status != "restored" {
		t.Fatalf("restore %s err %v", status, err)
	}
	status, err = RestoreOfficialStyleRecipe(context.Background(), db, "local", "official")
	if err != nil || status != "already_visible" {
		t.Fatalf("again %s err %v", status, err)
	}
	status, err = RestoreOfficialStyleRecipe(context.Background(), db, "local", "mine")
	if err != nil || status != "not_official" {
		t.Fatalf("private %s err %v", status, err)
	}
	recipe, err := CreateStyleRecipe(context.Background(), db, "local", StyleRecipeInput{Name: "新风格", Category: "general", PromptSnippet: "配方", SampleImages: "[]"})
	if err != nil || recipe["workspaceId"] != "local" || recipe["name"] != "新风格" || recipe["category"] != "general" {
		t.Fatalf("created %#v err %v", recipe, err)
	}
	if recipe["category"] != "general" || recipe["sampleImages"] != "[]" {
		t.Fatalf("created %#v", recipe)
	}
}

func TestSaveStyleRecipeCopiesOfficial(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "save-style.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "StyleRecipe" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
		"tag" TEXT, "desc" TEXT, "promptSnippet" TEXT NOT NULL, "coverUrl" TEXT, "sampleImages" TEXT,
		"sourceUrl" TEXT, "isFavorite" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAssetUsageEvent" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "batchId" TEXT NOT NULL,
		"eventType" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "metadata" TEXT NOT NULL DEFAULT '{}'
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "StyleRecipe" ("id","workspaceId","name","category","promptSnippet","createdAt","updatedAt") VALUES
		('official','official','官方','general','原配方','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
		('mine','local','我的','general','原配方','2026-01-02T00:00:00.000Z','2026-01-02T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	name := "改过的"
	recipe, copied, err := SaveStyleRecipe(context.Background(), db, "local", "mine", StyleChanges{Name: &name})
	if err != nil || copied || recipe["name"] != "改过的" || recipe["id"] != "mine" || recipe["createdAt"] != "2026-01-02T00:00:00.000Z" {
		t.Fatalf("private %#v copied %v err %v", recipe, copied, err)
	}
	recipe, copied, err = SaveStyleRecipe(context.Background(), db, "local", "official", StyleChanges{Name: &name})
	if err != nil || !copied || recipe["name"] != "改过的" || recipe["workspaceId"] != "local" || recipe["promptSnippet"] != "原配方" {
		t.Fatalf("copy %#v copied %v err %v", recipe, copied, err)
	}
	var officialName string
	if err := db.QueryRow(`SELECT "name" FROM "StyleRecipe" WHERE "id" = 'official'`).Scan(&officialName); err != nil || officialName != "官方" {
		t.Fatalf("official name %s err %v", officialName, err)
	}
	if _, _, err := SaveStyleRecipe(context.Background(), db, "local", "official", StyleChanges{Name: &name}); err != ErrStyleMissing {
		t.Fatalf("hidden official err %v", err)
	}
}
