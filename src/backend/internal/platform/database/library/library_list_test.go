package library

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/platform/database"
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

func TestDeleteLibraryAssetsKeepsOfficialRows(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "library.db"))
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

func TestListAllLibraryAssetsKeepsEachType(t *testing.T) {
	db := openPromptCreateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "OutfitAsset", outfitAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	createLibraryTable(t, db, "PersonaAsset", personaAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"motherAssetId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","sourceImages","isFavorite","usageCount","createdAt") VALUES
		('room','local','窗边','["a.jpg"]',0,0,'2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "OutfitAsset" ("id","workspaceId","title","isFavorite","usageCount","createdAt") VALUES
		('shirt','local','女士衬衫',0,0,'2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PersonaAsset" ("id","workspaceId","name","isFavorite","usageCount","createdAt") VALUES
		('boy','local','男童',0,0,'2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset"
		("id","workspaceId","title","provenance","groupIndex","reversePromptZh","createdAt","isFavorite","usageCount") VALUES
		('early','local','窗边母组','manual',1,'街边走路的中文提示','2026-01-01T00:00:00.000Z',0,0),
		('old','local','旧单图','legacy_single',NULL,'不会出现','2026-01-02T00:00:00.000Z',1,9)`); err != nil {
		t.Fatal(err)
	}
	all, err := ListAllLibraryAssets(context.Background(), db, "local", 1, false)
	if err != nil || all.HasMore || len(all.Scenes) != 1 || len(all.Outfits) != 1 || len(all.Personas) != 1 || len(all.FullPrompts) != 1 {
		t.Fatalf("counts scenes %d outfits %d personas %d prompts %d more %v err %v", len(all.Scenes), len(all.Outfits), len(all.Personas), len(all.FullPrompts), all.HasMore, err)
	}
	if !strings.Contains(string(all.Scenes[0]), `"code":"S-room"`) || !strings.Contains(string(all.Scenes[0]), `"shotCount":4`) {
		t.Fatalf("scene %s", all.Scenes[0])
	}
	if !strings.Contains(string(all.Outfits[0]), `"appearanceAudience":"adult_female"`) || !strings.Contains(string(all.Outfits[0]), `"code":"O-hirt"`) {
		t.Fatalf("outfit %s", all.Outfits[0])
	}
	if !strings.Contains(string(all.Personas[0]), `"appearanceAudience":"child_male"`) {
		t.Fatalf("persona %s", all.Personas[0])
	}
	if !strings.Contains(string(all.FullPrompts[0]), `"id":"early"`) {
		t.Fatalf("prompt %s", all.FullPrompts[0])
	}
	slim, err := ListAllLibraryAssets(context.Background(), db, "local", 1, true)
	if err != nil || len(slim.FullPrompts) != 1 || !strings.Contains(string(slim.FullPrompts[0]), `"promptPreview":"街边走路的中文提示"`) || strings.Contains(string(slim.FullPrompts[0]), "reversePromptZh") {
		t.Fatalf("slim %s %v", slim.FullPrompts, err)
	}
}
