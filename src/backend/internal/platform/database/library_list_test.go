package database

import (
	"context"
	"strings"
	"testing"
)

func TestListLibraryAssetsOrdersFavoritesAndFilters(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "OutfitAsset", outfitAssetColumns)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "parentId" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId") VALUES ('jewelry','local',NULL), ('ring','local','jewelry')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "OutfitAsset"
		("id","workspaceId","title","isFavorite","usageCount","createdAt","productCategoryIds","isUniversal") VALUES
		('plain','local','白衬衫',0,1,'2026-01-03T00:00:00.000Z','[]',0),
		('loved','local','真丝衬衫',1,0,'2026-01-01T00:00:00.000Z','["ring"]',0),
		('official','official','官方衬衫',0,9,'2026-01-04T00:00:00.000Z','[]',0),
		('other','elsewhere','别人的衬衫',1,9,'2026-01-05T00:00:00.000Z','[]',0)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","sourceImages","isFavorite","usageCount","createdAt") VALUES
		('room','local','窗边','["a.jpg"]',0,0,'2026-01-01T00:00:00.000Z'),
		('garden','local','苏州园林','[]',0,0,'2026-01-02T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	list, err := ListLibraryAssets(context.Background(), db, "local", "outfit", 1, 1, "", false, "", "", true, "")
	if err != nil || list.Total != 3 || len(list.Items) != 1 || !strings.Contains(string(list.Items[0]), `"title":"真丝衬衫"`) || !strings.Contains(string(list.Items[0]), `"code":"O-oved"`) {
		t.Fatalf("page %d %#v %v", list.Total, list.Items, err)
	}
	keyword, err := ListLibraryAssets(context.Background(), db, "local", "outfit", 1, 50, "真丝", false, "", "", true, "")
	if err != nil || keyword.Total != 1 {
		t.Fatalf("keyword %d %v", keyword.Total, err)
	}
	favorite, err := ListLibraryAssets(context.Background(), db, "local", "outfit", 1, 50, "", true, "", "", true, "")
	if err != nil || favorite.Total != 1 {
		t.Fatalf("favorite %d %v", favorite.Total, err)
	}
	category, err := ListLibraryAssets(context.Background(), db, "local", "outfit", 1, 50, "", false, "", "jewelry", false, "")
	if err != nil || category.Total != 1 || !strings.Contains(string(category.Items[0]), `"id":"loved"`) {
		t.Fatalf("category %d %#v %v", category.Total, category.Items, err)
	}
	style, err := ListLibraryAssets(context.Background(), db, "local", "scene", 1, 50, "", false, "", "", true, "chinese_style")
	if err != nil || style.Total != 1 || !strings.Contains(string(style.Items[0]), `"id":"garden"`) {
		t.Fatalf("style %d %#v %v", style.Total, style.Items, err)
	}
	scene, err := ListLibraryAssets(context.Background(), db, "local", "scene", 1, 50, "", false, "", "", true, "")
	if err != nil || scene.Total != 2 {
		t.Fatalf("scene %d %v", scene.Total, err)
	}
	foundRoom := false
	for _, item := range scene.Items {
		if strings.Contains(string(item), `"id":"room"`) && strings.Contains(string(item), `"code":"S-room"`) && strings.Contains(string(item), `"sceneSourceKey":`) {
			foundRoom = true
		}
	}
	if !foundRoom {
		t.Fatalf("scene %#v", scene.Items)
	}
}
