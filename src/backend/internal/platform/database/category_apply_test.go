package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApplyCategoryMigrationWritesScopedRows(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "apply.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "parentId" TEXT,
		"position" INTEGER NOT NULL DEFAULT 0, "isArchived" INTEGER NOT NULL DEFAULT 0,
		"aliases" TEXT NOT NULL DEFAULT '[]', "keywords" TEXT NOT NULL DEFAULT '[]', "anatomy" TEXT NOT NULL DEFAULT '[]'
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","keywords") VALUES
		('official-bag','official','托特包','bag','["旧词"]'),
		('taken','local','已占用','jewelry','[]')`); err != nil {
		t.Fatal(err)
	}
	defaults := filepath.Join(t.TempDir(), "defaults.json")
	if err := os.WriteFile(defaults, []byte(`{"jewelry":[],"bag":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	items := []CategoryApplyItem{
		{ID: "neck", ParentID: "jewelry", Label: "项链", Keywords: []string{"项链"}, Anatomy: "neck"},
		{ID: "brace", ParentID: "jewelry", Label: "手链"},
		{ID: "taken", ParentID: "jewelry", Label: "新类目", Keywords: []string{"新"}},
		{ID: "tote", ParentID: "bag", Label: "托特包", Keywords: []string{"新托特"}},
	}
	raw, err := ApplyCategoryMigration(context.Background(), db, "local", defaults, items)
	if err != nil {
		t.Fatal(err)
	}
	var parentName string
	var parentPosition int
	var parentID sql.NullString
	if err := db.QueryRow(`SELECT "name", "position", "parentId" FROM "AssetProductCategory" WHERE "id" = 'jewelry'`).Scan(&parentName, &parentPosition, &parentID); err != nil {
		t.Fatal(err)
	}
	if parentName != "珠宝首饰" || parentPosition != 0 || parentID.Valid {
		t.Fatalf("parent %s %d valid %v", parentName, parentPosition, parentID.Valid)
	}
	assertCategory(t, db, "neck", "local", 1, `["项链"]`, `["neck"]`)
	assertCategory(t, db, "brace", "local", 2, `[]`, `[]`)
	var createdID, createdWorkspace string
	if err := db.QueryRow(`SELECT "id", "workspaceId" FROM "AssetProductCategory" WHERE "name" = '新类目'`).Scan(&createdID, &createdWorkspace); err != nil {
		t.Fatal(err)
	}
	if createdWorkspace != "local" || !strings.HasPrefix(createdID, "cat_") || len(createdID) != 16 {
		t.Fatalf("created %s %s", createdID, createdWorkspace)
	}
	var officialKeywords string
	if err := db.QueryRow(`SELECT "keywords" FROM "AssetProductCategory" WHERE "id" = 'official-bag'`).Scan(&officialKeywords); err != nil {
		t.Fatal(err)
	}
	if officialKeywords != `["旧词"]` {
		t.Fatalf("official keywords %s", officialKeywords)
	}
	var toteCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "AssetProductCategory" WHERE "name" = '托特包'`).Scan(&toteCount); err != nil {
		t.Fatal(err)
	}
	if toteCount != 1 {
		t.Fatalf("tote count %d", toteCount)
	}
	if _, err := ApplyCategoryMigration(context.Background(), db, "local", defaults, []CategoryApplyItem{
		{ID: "neck-2", ParentID: "jewelry", Label: "项链", Keywords: []string{"吊坠"}, Anatomy: "chain"},
	}); err != nil {
		t.Fatal(err)
	}
	assertCategory(t, db, "neck", "local", 1, `["吊坠"]`, `["chain"]`)
	var categories map[string][]map[string]any
	if err := json.Unmarshal(raw, &categories); err != nil {
		t.Fatal(err)
	}
	if len(categories["jewelry"]) != 4 || len(categories["bag"]) != 1 {
		t.Fatalf("categories %#v", categories)
	}
}

func assertCategory(t *testing.T, db *sql.DB, id, workspace string, position int, keywords, anatomy string) {
	t.Helper()
	var gotWorkspace, gotKeywords, gotAnatomy string
	var gotPosition int
	if err := db.QueryRow(`SELECT "workspaceId", "position", "keywords", "anatomy" FROM "AssetProductCategory" WHERE "id" = ?`, id).Scan(&gotWorkspace, &gotPosition, &gotKeywords, &gotAnatomy); err != nil {
		t.Fatal(err)
	}
	if gotWorkspace != workspace || gotPosition != position || gotKeywords != keywords || gotAnatomy != anatomy {
		t.Fatalf("%s workspace %s position %d keywords %s anatomy %s", id, gotWorkspace, gotPosition, gotKeywords, gotAnatomy)
	}
}
