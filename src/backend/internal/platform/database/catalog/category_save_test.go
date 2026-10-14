package catalog

import (
	"context"
	"strings"
	"testing"
)

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
