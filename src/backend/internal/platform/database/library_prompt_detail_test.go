package database

import (
	"context"
	"strings"
	"testing"
)

func TestLibraryPromptDetailNumbersAndReplacement(t *testing.T) {
	db := openPromptCreateDB(t)
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"motherAssetId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset"
		("id","workspaceId","title","provenance","groupIndex","displayNumber","createdAt") VALUES
		('group','local','窗边母组','manual',1,9,'2026-01-02T00:00:00.000Z'),
		('old','local','旧单图','legacy_single',NULL,8,'2026-01-01T00:00:00.000Z'),
		('mom1','local','来源母组','manual',1,3,'2026-01-01T00:00:00.000Z'),
		('child','local','生成图组','workshop_generated',NULL,4,'2026-01-03T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry"
		("id","workspaceId","assetType","sourceAssetId","status","version","provenance","sourceRef","createdAt","updatedAt") VALUES
		('regmom','local','full_prompt','mom1','published',1,'manual',NULL,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'),
		('regchild','local','full_prompt','child','published',1,'workshop_generated','regmom','2026-01-03T00:00:00.000Z','2026-01-03T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	group, err := LibraryPromptDetail(context.Background(), db, "local", "group")
	if err != nil || !strings.Contains(string(group), `"displayNumber":2`) || !strings.Contains(string(group), `"imageReplaceable":true`) || !strings.Contains(string(group), "母本缺少完整的四图分镜") {
		t.Fatalf("group %s %v", group, err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptImageReplacement" ("motherAssetId","workspaceId") VALUES ('group','local')`); err != nil {
		t.Fatal(err)
	}
	replaced, err := LibraryPromptDetail(context.Background(), db, "local", "group")
	if err != nil || !strings.Contains(string(replaced), `"imageReplaced":true`) || !strings.Contains(string(replaced), `"imageReplaceable":false`) {
		t.Fatalf("replaced %s %v", replaced, err)
	}
	old, err := LibraryPromptDetail(context.Background(), db, "local", "old")
	if err != nil || !strings.Contains(string(old), `"displayNumber":null`) {
		t.Fatalf("old %s %v", old, err)
	}
	child, err := LibraryPromptDetail(context.Background(), db, "local", "child")
	if err != nil || !strings.Contains(string(child), `"title":"来源母组"`) || !strings.Contains(string(child), `"code":"R-mom1"`) || !strings.Contains(string(child), `"available":true`) {
		t.Fatalf("child %s %v", child, err)
	}
	if _, err := LibraryPromptDetail(context.Background(), db, "local", "missing"); err != ErrLibraryDetailMissing {
		t.Fatalf("missing %v", err)
	}
}
