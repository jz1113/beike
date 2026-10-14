package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestPreviewCategoryMigrationMergesSources(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "preview.db"))
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
