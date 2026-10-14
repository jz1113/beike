package database

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpdateLibraryAssetChangesCurrentScene(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","createdAt","updatedAt","isFavorite","usageCount","isUniversal") VALUES
		('mine','local','旧标题','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0,0,0),
		('official','official','官方','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',0,0,0)`); err != nil {
		t.Fatal(err)
	}
	item, err := UpdateLibraryAsset(context.Background(), db, "local", "scene", "mine", map[string]any{"title": "新标题"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(item), `"title":"新标题"`) || !strings.Contains(string(item), `"createdAt":"2026-01-01T00:00:00.000Z"`) {
		t.Fatalf("item %s", item)
	}
	if strings.Index(string(item), `"title"`) > strings.Index(string(item), `"createdAt"`) {
		t.Fatalf("field order %s", item)
	}
	var official string
	if err := db.QueryRow(`SELECT "title" FROM "SceneAsset" WHERE "id" = 'official'`).Scan(&official); err != nil || official != "官方" {
		t.Fatalf("official %s %v", official, err)
	}
	if _, err := UpdateLibraryAsset(context.Background(), db, "local", "scene", "official", map[string]any{"title": "改官方"}); !errors.Is(err, ErrLibraryRecordMissing) {
		t.Fatalf("official update %v", err)
	}
}

func TestUpdateLibraryAssetRejectsMissingScene(t *testing.T) {
	db := openLibraryUpdateDB(t)
	if _, err := db.Exec(`CREATE TABLE "SceneAsset" ("id" TEXT, "workspaceId" TEXT)`); err != nil {
		t.Fatal(err)
	}
	_, err := UpdateLibraryAsset(context.Background(), db, "local", "action", "pose", map[string]any{"sceneId": "missing"})
	if err == nil || err.Error() != "场景不存在或不属于当前工作区" {
		t.Fatalf("error %v", err)
	}
}

func TestUpdateFullPromptStoresBuiltinSubcategory(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "FullPromptAsset", fullPromptAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "parentId" TEXT, "isArchived" INTEGER NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "productCategoryId" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId","isArchived") VALUES
		('digital_3c','local',NULL,0),
		('prompt_subcategory:digital_3c:phone','local','digital_3c',0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","productCategoryId") VALUES ('album','local',NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset"
		("id","workspaceId","albumId","productCategoryIds","productSubcategory","isUniversal","hasHuman","isFavorite","usageCount") VALUES
		('group','local','album','[]','case',0,1,0,0),
		('sibling','local','album','[]','case',0,1,0,0),
		('official','official','album','[]',NULL,0,1,0,0)`); err != nil {
		t.Fatal(err)
	}
	_, err := UpdateLibraryAsset(context.Background(), db, "local", "full_prompt", "group", map[string]any{
		"productCategoryIds": `["digital_3c"]`,
		"productSubcategory": "prompt_subcategory:digital_3c:phone",
	})
	if err != nil {
		t.Fatal(err)
	}
	var subcategory, categories, sibling sql.NullString
	var albumCategory sql.NullString
	if err := db.QueryRow(`SELECT "productSubcategory", "productCategoryIds" FROM "FullPromptAsset" WHERE "id" = 'group'`).Scan(&subcategory, &categories); err != nil {
		t.Fatal(err)
	}
	if subcategory.String != "phone" || categories.String != `["digital_3c"]` {
		t.Fatalf("group %s %s", subcategory.String, categories.String)
	}
	if err := db.QueryRow(`SELECT "productSubcategory" FROM "FullPromptAsset" WHERE "id" = 'sibling'`).Scan(&sibling); err != nil || sibling.Valid {
		t.Fatalf("sibling %#v %v", sibling, err)
	}
	if err := db.QueryRow(`SELECT "productCategoryId" FROM "PromptAlbum" WHERE "id" = 'album'`).Scan(&albumCategory); err != nil || albumCategory.String != "digital_3c" {
		t.Fatalf("album %#v %v", albumCategory, err)
	}
	if _, err := UpdateLibraryAsset(context.Background(), db, "local", "full_prompt", "official", map[string]any{"title": "改官方"}); err == nil || err.Error() != "官方图组不可修改" {
		t.Fatalf("official %v", err)
	}
}

func openLibraryUpdateDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenWrite(filepath.Join(t.TempDir(), "library.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func createLibraryTable(t *testing.T, db *sql.DB, table string, columns []assetColumn) {
	t.Helper()
	parts := make([]string, len(columns))
	for i, column := range columns {
		kind := "TEXT"
		switch column.kind {
		case colInt, colNullInt, colBool:
			kind = "INTEGER"
		}
		parts[i] = `"` + column.name + `" ` + kind
	}
	if _, err := db.Exec(`CREATE TABLE "` + table + `" (` + strings.Join(parts, ",") + `)`); err != nil {
		t.Fatal(err)
	}
}
