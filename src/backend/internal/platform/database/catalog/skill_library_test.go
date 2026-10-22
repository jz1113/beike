package catalog

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
)

func skillTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "skills.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	schema, err := os.ReadFile("../migrate/sources/skill_library.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(schema)); err != nil {
		t.Fatal(err)
	}
	return db
}

func skillDoc(id, prompt string) map[string]any {
	return map[string]any{"id": id, "name": "测试技能", "prompt": prompt,
		"files": []any{map[string]any{"path": "references/example.md", "content": "完整资料"}},
		"meta":  map[string]any{"genres": []any{"图片"}, "coverUrl": "/storage/cover.png"}}
}

func TestSkillDocumentsVersionAndWorkspaceIsolation(t *testing.T) {
	db := skillTestDB(t)
	ctx := context.Background()
	first, err := SaveSkillDocument(ctx, db, "a", skillDoc("same", "旧规则"), "", true)
	if err != nil {
		t.Fatal(err)
	}
	v1 := first["libraryVersion"].(string)
	if _, err := SaveSkillDocument(ctx, db, "b", skillDoc("same", "B规则"), "", true); err != nil {
		t.Fatal(err)
	}
	updated, err := SaveSkillDocument(ctx, db, "a", skillDoc("same", "新规则"), v1, false)
	if err != nil {
		t.Fatal(err)
	}
	if updated["libraryVersion"] == v1 {
		t.Fatal("content change did not create version")
	}
	if _, err := SaveSkillDocument(ctx, db, "a", skillDoc("same", "过期编辑"), v1, false); err != ErrSkillConflict {
		t.Fatalf("stale write: %v", err)
	}
	if err := DeleteSkillDocument(ctx, db, "a", "same", v1); err != ErrSkillConflict {
		t.Fatalf("stale delete: %v", err)
	}
	old, err := ReadSkillRevision(ctx, db, "a", "assistant", "same", v1)
	if err != nil || old["prompt"] != "旧规则" || old["files"] == nil || old["meta"] == nil {
		t.Fatalf("snapshot: %#v %v", old, err)
	}
	if _, err := ReadSkillRevision(ctx, db, "b", "assistant", "same", v1); err != sql.ErrNoRows {
		t.Fatalf("cross-workspace read: %v", err)
	}
	items, err := ListSkillDocuments(ctx, db, "b")
	if err != nil || len(items) != 1 || items[0]["prompt"] != "B规则" {
		t.Fatalf("workspace list: %#v %v", items, err)
	}
}

func TestSkillImportPreservesConflictsAndDeletion(t *testing.T) {
	db := skillTestDB(t)
	ctx := context.Background()
	if _, err := SaveSkillDocument(ctx, db, "a", skillDoc("same", "服务端规则"), "", true); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := ImportSkillDocuments(ctx, db, "a", []map[string]any{skillDoc("same", "浏览器规则")}); err != nil {
			t.Fatal(err)
		}
	}
	items, err := ListSkillDocuments(ctx, db, "a")
	if err != nil || len(items) != 2 {
		t.Fatalf("import: %#v %v", items, err)
	}
	var imported map[string]any
	for _, item := range items {
		if item["id"] == "same" && item["prompt"] != "服务端规则" {
			t.Fatal("server overwritten")
		}
		if item["prompt"] == "浏览器规则" {
			imported = item
		}
	}
	if imported == nil {
		t.Fatal("conflict copy missing")
	}
	if err := DeleteSkillDocument(ctx, db, "a", imported["id"].(string), imported["libraryVersion"].(string)); err != nil {
		t.Fatal(err)
	}
	if err := ImportSkillDocuments(ctx, db, "a", []map[string]any{skillDoc("same", "浏览器规则")}); err != nil {
		t.Fatal(err)
	}
	items, err = ListSkillDocuments(ctx, db, "a")
	if err != nil || len(items) != 1 {
		t.Fatalf("deleted skill resurrected: %#v %v", items, err)
	}
	if err := ImportSkillDocuments(ctx, db, "b", []map[string]any{skillDoc("same", "浏览器规则")}); err != nil {
		t.Fatal(err)
	}
	other, _ := ListSkillDocuments(ctx, db, "b")
	if len(other) != 1 || other[0]["id"] != "same" {
		t.Fatal("import mapping leaked across workspaces")
	}
}

func TestSkillFavoriteDoesNotChangeContentVersion(t *testing.T) {
	db := skillTestDB(t)
	ctx := context.Background()
	doc, err := SaveSkillDocument(ctx, db, "a", skillDoc("one", "规则"), "", true)
	if err != nil {
		t.Fatal(err)
	}
	if err := SetSkillFavorite(ctx, db, "b", "assistant", "one", true); err != ErrSkillMissing {
		t.Fatalf("foreign favorite: %v", err)
	}
	if err := SetSkillFavorite(ctx, db, "a", "assistant", "one", true); err != nil {
		t.Fatal(err)
	}
	prefs, err := SkillFavorites(ctx, db, "a")
	if err != nil || !prefs["assistant:one"] {
		t.Fatalf("preferences: %#v %v", prefs, err)
	}
	items, _ := ListSkillDocuments(ctx, db, "a")
	if items[0]["libraryVersion"] != doc["libraryVersion"] {
		t.Fatal("favorite changed execution version")
	}
}

func TestWorkshopSkillVersionGuardsEditsAndPreservesSnapshots(t *testing.T) {
	db := skillTestDB(t)
	ctx := context.Background()
	_, err := db.Exec(`CREATE TABLE "StyleRecipe" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL,
		"tag" TEXT, "desc" TEXT, "promptSnippet" TEXT NOT NULL, "coverUrl" TEXT, "sampleImages" TEXT,
		"sourceUrl" TEXT, "isFavorite" INTEGER NOT NULL DEFAULT 0, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
	);
	CREATE TABLE "PromptAssetUsageEvent" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "batchId" TEXT NOT NULL,
		"eventType" TEXT NOT NULL, "createdAt" TEXT NOT NULL, "metadata" TEXT NOT NULL
	);`)
	if err != nil {
		t.Fatal(err)
	}
	created, err := CreateStyleRecipe(ctx, db, "a", StyleRecipeInput{Name: "珠宝", Category: "jewelry", PromptSnippet: "旧规则", SampleImages: `["/storage/reference.png"]`})
	if err != nil {
		t.Fatal(err)
	}
	page, err := ListStyleRecipes(ctx, db, "a", "", 1, 100)
	if err != nil || len(page.Recipes) != 1 {
		t.Fatalf("list %v", err)
	}
	id := created["id"].(string)
	version, err := RememberSkillRevision(ctx, db, "a", "workshop", id, page.Recipes[0])
	if err != nil {
		t.Fatal(err)
	}
	newPrompt := "新规则"
	if _, _, err := SaveStyleRecipe(ctx, db, "a", id, StyleChanges{PromptSnippet: &newPrompt, ExpectedVersion: version}); err != nil {
		t.Fatalf("valid version rejected: %v", err)
	}
	if _, _, err := SaveStyleRecipe(ctx, db, "a", id, StyleChanges{PromptSnippet: &newPrompt, ExpectedVersion: version}); err != ErrSkillConflict {
		t.Fatalf("stale edit: %v", err)
	}
	if err := DeleteStyleRecipe(ctx, db, "a", id, version); err != ErrSkillConflict {
		t.Fatalf("stale delete: %v", err)
	}
	old, err := ReadSkillRevision(ctx, db, "a", "workshop", id, version)
	if err != nil || old["promptSnippet"] != "旧规则" || old["sampleImages"] != `["/storage/reference.png"]` {
		t.Fatalf("old snapshot %#v %v", old, err)
	}
	if _, err := ReadSkillRevision(ctx, db, "b", "workshop", id, version); err != sql.ErrNoRows {
		t.Fatal("workshop revision crossed workspaces")
	}
}
