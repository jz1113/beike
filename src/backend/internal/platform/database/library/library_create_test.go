package library

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

func TestCreateActionMediaRetainsTypeAndSource(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	for _, kind := range []string{"image", "video", "depth-image", "depth-video"} {
		item, err := CreateLibraryAsset(context.Background(), db, "local", "action", map[string]any{
			"title": "动作", "mediaType": kind, "mediaUrl": "/result", "sourceUrl": "/original",
		})
		if err != nil || !strings.Contains(string(item), `"mediaType":"`+kind+`"`) || !strings.Contains(string(item), `"mediaUrl":"/result"`) || !strings.Contains(string(item), `"sourceUrl":"/original"`) {
			t.Fatalf("kind %s: %s %v", kind, item, err)
		}
	}
	for _, data := range []map[string]any{{"mediaType": "audio"}, {"mediaType": "depth-video"}, {"mediaType": "video", "mediaUrl": 3}} {
		if _, err := CreateLibraryAsset(context.Background(), db, "local", "action", data); err == nil {
			t.Fatalf("accepted invalid media: %+v", data)
		}
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM "ActionAsset"`).Scan(&count); err != nil || count != 4 {
		t.Fatalf("partial writes: %d %v", count, err)
	}
}

func TestSaveDepthActionRetryIsScopedAndDoesNotDuplicate(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	data := map[string]any{"clientTaskId": "depth-receipt", "title": "深度动作", "mediaType": "depth-video", "mediaUrl": "/depth.mp4", "sourceUrl": "/original.mp4"}
	first, err := CreateLibraryAsset(context.Background(), db, "mine", "action", data)
	if err != nil {
		t.Fatal(err)
	}
	again, err := CreateLibraryAsset(context.Background(), db, "mine", "action", data)
	if err != nil || string(first) != string(again) {
		t.Fatalf("retry %s %v", again, err)
	}
	other, err := CreateLibraryAsset(context.Background(), db, "other", "action", data)
	if err != nil || string(other) == string(first) {
		t.Fatalf("workspace %s %v", other, err)
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM "ActionAsset"`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("count %d %v", count, err)
	}
}
