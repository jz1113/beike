package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestDuplicateSourceAlbumGroups(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "sources.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "FullPromptAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "albumId" TEXT, "sourceImages" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name") VALUES
		('a','local','图集甲'), ('b','official','图集乙'), ('c','other','别人的')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","albumId","sourceImages") VALUES
		('1','local','a','["same"]'), ('2','local','b','["same"]'), ('3','local','c','["same"]'),
		('4','local','a','[]')`); err != nil {
		t.Fatal(err)
	}
	groups, err := DuplicateSourceAlbumGroups(context.Background(), db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || len(groups[0]) != 2 {
		t.Fatalf("groups %#v", groups)
	}
}
