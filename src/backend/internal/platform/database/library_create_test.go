package database

import (
	"context"
	"strings"
	"testing"
)

func TestCreateLibraryAssetUsesDefaultsAndRegistry(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "OutfitAsset", outfitAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "PromptAssetRegistry" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "assetType" TEXT, "sourceAssetId" TEXT,
		"status" TEXT, "version" INTEGER, "provenance" TEXT, "sourceRef" TEXT,
		"qualityScore" REAL, "confidence" REAL, "publishedAt" TEXT, "disabledReason" TEXT,
		"createdAt" TEXT, "updatedAt" TEXT,
		UNIQUE ("workspaceId", "assetType", "sourceAssetId")
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title") VALUES ('official','official','官方场景')`); err != nil {
		t.Fatal(err)
	}
	item, err := CreateLibraryAsset(context.Background(), db, "local", "scene", map[string]any{
		"tags": []any{"窗棂", "园林"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(item), `"title":"新生活场景"`) || !strings.Contains(string(item), `"tags":"窗棂, 园林"`) || !strings.Contains(string(item), `"lighting":"自然采光与清晰接触阴影"`) {
		t.Fatalf("scene %s", item)
	}
	var status, provenance string
	if err := db.QueryRow(`SELECT "status", "provenance" FROM "PromptAssetRegistry" WHERE "assetType" = 'scene'`).Scan(&status, &provenance); err != nil {
		t.Fatal(err)
	}
	if status != "published" || provenance != "manual" {
		t.Fatalf("registry %s %s", status, provenance)
	}
	outfit, err := CreateLibraryAsset(context.Background(), db, "local", "outfit", map[string]any{})
	if err != nil || !strings.Contains(string(outfit), `"title":"新显白穿搭"`) {
		t.Fatalf("outfit %s %v", outfit, err)
	}
	created, err := CreateLibraryAsset(context.Background(), db, "local", "action", map[string]any{"sceneId": "official", "title": "侧颜"})
	if err != nil || !strings.Contains(string(created), `"title":"侧颜"`) || !strings.Contains(string(created), `"sceneId":"official"`) {
		t.Fatalf("action %s %v", created, err)
	}
	if _, err := CreateLibraryAsset(context.Background(), db, "local", "action", map[string]any{"sceneId": "missing"}); err == nil || err.Error() != "场景不存在或不属于当前工作区" {
		t.Fatalf("missing scene %v", err)
	}
}

func TestCreateLibraryAssetStoresShotOrder(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	item, err := CreateLibraryAsset(context.Background(), db, "local", "action", map[string]any{})
	if err != nil || !strings.Contains(string(item), `"title":"新抓拍动作"`) || !strings.Contains(string(item), `"shotType":"half_body"`) {
		t.Fatalf("defaults %s %v", item, err)
	}
	var order int
	if err := db.QueryRow(`SELECT "shotOrder" FROM "ActionAsset"`).Scan(&order); err != nil || order != 0 {
		t.Fatalf("order %d %v", order, err)
	}
}
