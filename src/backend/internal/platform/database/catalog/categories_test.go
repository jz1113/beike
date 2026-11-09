package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestListServerSubCategoriesUsesDefaultsThenRows(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "categories.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "parentId" TEXT, "name" TEXT NOT NULL,
		"position" INTEGER NOT NULL DEFAULT 0, "keywords" TEXT NOT NULL DEFAULT '[]', "anatomy" TEXT NOT NULL DEFAULT '[]'
	)`); err != nil {
		t.Fatal(err)
	}
	defaults := filepath.Join(repoRoot(t), "src/shared/data/defaultSubCategories.json")
	empty, err := ListServerSubCategories(context.Background(), db, "local", defaults)
	if err != nil {
		t.Fatal(err)
	}
	if keys := objectKeys(t, empty); keys[0] != "jewelry" || keys[len(keys)-1] != "universal" {
		t.Fatalf("keys %#v", keys)
	}
	categories := map[string][]map[string]any{}
	if err := json.Unmarshal(empty, &categories); err != nil {
		t.Fatal(err)
	}
	if categories["jewelry"][0]["id"] != "necklace" || len(categories["bag"]) != 0 {
		t.Fatalf("defaults %#v", categories["jewelry"][0])
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId","name","position","keywords","anatomy") VALUES
		('custom','local','jewelry','定制项链',0,'["项链",1]','["neck"]'),
		('foreign','other','jewelry','其他工作区',0,'[]','[]'),
		('root','local','', '父级',0,'[]','[]')`); err != nil {
		t.Fatal(err)
	}
	replaced, err := ListServerSubCategories(context.Background(), db, "local", defaults)
	if err != nil {
		t.Fatal(err)
	}
	categories = map[string][]map[string]any{}
	if err := json.Unmarshal(replaced, &categories); err != nil {
		t.Fatal(err)
	}
	item := categories["jewelry"][0]
	if len(categories["jewelry"]) != 1 || item["id"] != "custom" || item["shortLabel"] != "定制项链" || item["anatomy"] != "neck" {
		t.Fatalf("replaced %#v", categories["jewelry"])
	}
	keywords, _ := item["keywords"].([]any)
	if len(keywords) != 1 || keywords[0] != "项链" {
		t.Fatalf("keywords %#v", item["keywords"])
	}
	if _, ok := categories["root"]; ok {
		t.Fatal("没有父级的类目不应出现")
	}
	if len(categories["apparel"]) == 0 {
		t.Fatal("没有数据库记录的类目应保留默认清单")
	}
}

func objectKeys(t *testing.T, raw []byte) []string {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil {
		t.Fatal(err)
	}
	keys := []string{}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			t.Fatal(err)
		}
		var skip json.RawMessage
		if err := decoder.Decode(&skip); err != nil {
			t.Fatal(err)
		}
		keys = append(keys, token.(string))
	}
	return keys
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("找不到仓库根目录")
		}
		dir = parent
	}
}

func TestApplyCategoryMigrationWritesScopedRows(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "apply.db"))
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

func TestPreviewCategoryMigrationMergesSources(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "preview.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "parentId" TEXT, "name" TEXT NOT NULL,
		"position" INTEGER NOT NULL DEFAULT 0, "keywords" TEXT NOT NULL DEFAULT '[]', "anatomy" TEXT NOT NULL DEFAULT '[]'
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId","name","position","keywords","anatomy") VALUES
		('server-neck','local','jewelry','项链',0,'["吊坠"]','[]'),
		('official-bag','official','bag','托特包',0,'["托特"]','["bag"]'),
		('foreign','other','jewelry','外来',1,'["外来"]','[]')`); err != nil {
		t.Fatal(err)
	}
	defaults := filepath.Join(t.TempDir(), "defaults.json")
	if err := os.WriteFile(defaults, []byte(`{"jewelry":[{"id":"necklace","label":"项链","keywords":["项链"," "]}],"bag":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	alias := "别名"
	preview, err := PreviewCategoryMigration(context.Background(), db, "local", defaults, []LocalCategoryReport{{
		ParentID: "jewelry",
		Categories: []LocalCategory{
			{ID: "local-neck", ParentID: "jewelry", Label: "项链", Keywords: []string{"锁骨"}},
			{ID: "local-alias", ParentID: "jewelry", Label: alias, Keywords: []string{" 项链 "}},
			{ID: "bracelet", ParentID: "jewelry", Label: "", ShortLabel: "手链", Keywords: []string{"手链"}},
		},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Parents) != 2 || preview.CreatedCount != 1 || preview.MergedCount != 1 {
		t.Fatalf("preview %#v", preview)
	}
	neck := preview.Items[0]
	if neck.ID != "server-neck" || neck.Source != "server" || neck.DuplicateOf == nil || *neck.DuplicateOf != "server-neck" {
		t.Fatalf("neck %#v", neck)
	}
	if len(neck.Keywords) != 3 || neck.Keywords[0] != "吊坠" || neck.Keywords[1] != "项链" || neck.Keywords[2] != "锁骨" {
		t.Fatalf("keywords %#v", neck.Keywords)
	}
	if preview.Items[1].ID != "official-bag" || preview.Items[1].Source != "server" || preview.Items[1].Anatomy == nil || *preview.Items[1].Anatomy != "bag" {
		t.Fatalf("bag %#v", preview.Items[1])
	}
	if preview.Items[2].ID != "bracelet" || preview.Items[2].Label != "手链" || preview.Items[2].Source != "local" {
		t.Fatalf("items %#v", preview.Items)
	}
}

func TestSaveProductCategory(t *testing.T) {
	db := openOrganizationDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('archived','local','旧名',NULL,0,1,'[]','[]','[]'),
		('official','official','官方',NULL,1,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{Name: "  甲  "}); err != nil {
		t.Fatal(err)
	}
	var id, name string
	var parent interface{}
	var position, archived int
	if err := db.QueryRow(`SELECT "id", "name", "parentId", "position", "isArchived" FROM "AssetProductCategory" WHERE "name" = '甲'`).Scan(&id, &name, &parent, &position, &archived); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(id, "c") || position != 2 || archived != 0 || parent != nil {
		t.Fatalf("created %s position %d archived %d parent %#v", id, position, archived, parent)
	}
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{Name: "甲"}); err == nil || err.Error() != "同级品类名称已存在" {
		t.Fatalf("duplicate %v", err)
	}
	child, err := SaveProductCategory(context.Background(), db, "local", CategorySave{Name: "子类", ParentID: &id})
	if err != nil || len(child.Categories) == 0 {
		t.Fatalf("child %v %#v", err, child.Categories)
	}
	var childID string
	if err := db.QueryRow(`SELECT "id" FROM "AssetProductCategory" WHERE "name" = '子类'`).Scan(&childID); err != nil {
		t.Fatal(err)
	}
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{Name: "孙类", ParentID: &childID}); err == nil || err.Error() != "商品品类最多两级" {
		t.Fatalf("depth %v", err)
	}
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{Name: "旧名"}); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM "AssetProductCategory" WHERE "name" = '旧名'`).Scan(&position); err != nil || position != 1 {
		t.Fatalf("restored count %d err %v", position, err)
	}
	if err := db.QueryRow(`SELECT "isArchived" FROM "AssetProductCategory" WHERE "id" = 'archived'`).Scan(&archived); err != nil || archived != 0 {
		t.Fatalf("archived %d err %v", archived, err)
	}
	renamed := "新名"
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{ID: &id, Name: renamed}); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT "name" FROM "AssetProductCategory" WHERE "id" = ?`, id).Scan(&name); err != nil || name != renamed {
		t.Fatalf("renamed %s err %v", name, err)
	}
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{ID: &[]string{"official"}[0], Name: "改官方"}); err == nil {
		t.Fatal("官方品类不能直接改名")
	}
	if err := db.QueryRow(`SELECT "name" FROM "AssetProductCategory" WHERE "id" = 'official'`).Scan(&name); err != nil || name != "官方" {
		t.Fatalf("official %s err %v", name, err)
	}
	longName := strings.Repeat("字", 41)
	if _, err := SaveProductCategory(context.Background(), db, "local", CategorySave{Name: longName}); err == nil || err.Error() != "品类名称需为 1–40 个字" {
		t.Fatalf("length %v", err)
	}
}

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
