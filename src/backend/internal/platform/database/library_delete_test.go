package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestDeleteLibraryAssetsKeepsOfficialRows(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "library.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "SceneAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "coverUrl" TEXT, "sourceImages" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"workspaceId" TEXT NOT NULL, "motherAssetId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","coverUrl","sourceImages") VALUES
		('mine','local','/storage/azhuo/a.jpg','["/storage/azhuo/b.jpg"]'),
		('official','official','/storage/official/a.jpg','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId") VALUES ('group','local')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptImageReplacement" ("workspaceId","motherAssetId") VALUES ('local','group')`); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	count, err := DeleteLibraryAssets(context.Background(), db, "local", "scene", []string{"mine", "official"}, root)
	if err != nil || count != 1 {
		t.Fatalf("scene count %d err %v", count, err)
	}
	var official int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SceneAsset" WHERE "id" = 'official'`).Scan(&official); err != nil || official != 1 {
		t.Fatalf("official %d err %v", official, err)
	}
	entries, err := os.ReadDir(filepath.Join(root, "local"))
	if err != nil || len(entries) != 3 {
		t.Fatalf("reviews %#v err %v", entries, err)
	}
	count, err = DeleteLibraryAssets(context.Background(), db, "local", "full_prompt", []string{"group"}, root)
	if err != nil || count != 1 {
		t.Fatalf("group count %d err %v", count, err)
	}
	if _, err := DeleteLibraryAssets(context.Background(), db, "local", "full_prompt", []string{"missing"}, root); err == nil || err.Error() != "所选母组不存在或不可删除" {
		t.Fatalf("missing %v", err)
	}
}
