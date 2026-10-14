package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
	"testing"
)

func TestUpsertOfficialMasterRecipes(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "seed.db"))
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
	if _, err := db.Exec(`INSERT INTO "StyleRecipe" ("id","workspaceId","name","category","promptSnippet","sourceUrl","createdAt","updatedAt") VALUES
		('recipe_phone_comms_master','local','旧名','general','旧片段','https://example.test','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	recipes := []officialMasterRecipe{{
		ID: "recipe_jewelry_master", Name: "珠宝", Category: "jewelry_luxury", PromptSnippet: "骨架",
	}, {
		ID: "recipe_phone_comms_master", Name: "手机通讯", Category: "digital_3c", PromptSnippet: "新片段",
	}}
	if err := UpsertOfficialMasterRecipes(context.Background(), db, recipes); err != nil {
		t.Fatal(err)
	}
	var workspace, name, source string
	var favorite int
	if err := db.QueryRow(`SELECT "workspaceId", "name", "isFavorite" FROM "StyleRecipe" WHERE "id" = 'recipe_jewelry_master'`).Scan(&workspace, &name, &favorite); err != nil || workspace != "official" || name != "珠宝" || favorite != 1 {
		t.Fatalf("created %s %s %d err %v", workspace, name, favorite, err)
	}
	if err := db.QueryRow(`SELECT "workspaceId", "name", "sourceUrl" FROM "StyleRecipe" WHERE "id" = 'recipe_phone_comms_master'`).Scan(&workspace, &name, &source); err != nil || workspace != "official" || name != "手机通讯" || source != "https://example.test" {
		t.Fatalf("updated %s %s %s err %v", workspace, name, source, err)
	}
	loaded, err := LoadOfficialMasterRecipes(filepath.Join(repoRoot(t), "src/shared/data/officialMasterRecipes.json"))
	if err != nil || len(loaded) != 2 || loaded[0].ID != "recipe_jewelry_master" {
		t.Fatalf("catalog %#v err %v", loaded, err)
	}
}
