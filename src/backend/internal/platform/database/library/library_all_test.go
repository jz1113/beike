package library

import (
	"context"
	"strings"
	"testing"
)

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
