package library

import (
	"context"
	"strings"
	"testing"
)

func TestPurgeSeedAssetsKeepsUserAndOfficialRows(t *testing.T) {
	db := openLibraryUpdateDB(t)
	for _, table := range []string{"SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset"} {
		if _, err := db.Exec(`CREATE TABLE "` + table + `" (
			"id" TEXT, "workspaceId" TEXT, "title" TEXT, "name" TEXT, "provenance" TEXT, "reversePrompt" TEXT, "coverUrl" TEXT, "avatarUrl" TEXT
		)`); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","provenance","reversePrompt","coverUrl") VALUES
		('seed','local','苏式园林月亮门雕花木窗棂','manual',NULL,NULL),
		('covered','local','苏式园林月亮门雕花木窗棂','manual',NULL,'/cover.jpg'),
		('user','local','我的窗边','manual',NULL,NULL),
		('official','official','苏式园林月亮门雕花木窗棂','manual',NULL,NULL)`); err != nil {
		t.Fatal(err)
	}
	result, err := PurgeSeedAssets(context.Background(), db, "local")
	if err != nil || result.Scenes != 1 || result.Total() != 1 {
		t.Fatalf("purge %#v %v", result, err)
	}
	var kept int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SceneAsset"`).Scan(&kept); err != nil || kept != 3 {
		t.Fatalf("kept %d %v", kept, err)
	}
}

func TestClearLocalWorkspaceKeepsOfficialRows(t *testing.T) {
	db := openLibraryUpdateDB(t)
	for _, table := range append([]string{"FullPromptImageReplacement"}, workspaceClearTables...) {
		if _, err := db.Exec(`CREATE TABLE "` + table + `" ("id" TEXT, "workspaceId" TEXT)`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(`INSERT INTO "` + table + `" ("id","workspaceId") VALUES ('local-row','local')`); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId") VALUES ('official-scene','official')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "AssetProductCategory" ("id" TEXT, "workspaceId" TEXT, "parentId" TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","parentId") VALUES
		('parent','local',NULL), ('child','local','parent'), ('official-category','official',NULL)`); err != nil {
		t.Fatal(err)
	}
	deleted, err := ClearLocalWorkspace(context.Background(), db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if deleted != len(workspaceClearTables)+1+2 {
		t.Fatalf("deleted %d", deleted)
	}
	var officialScenes, officialCategories int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SceneAsset" WHERE "workspaceId" = 'official'`).Scan(&officialScenes); err != nil || officialScenes != 1 {
		t.Fatalf("official scenes %d %v", officialScenes, err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM "AssetProductCategory"`).Scan(&officialCategories); err != nil || officialCategories != 1 {
		t.Fatalf("categories %d %v", officialCategories, err)
	}
}

func TestDeduplicateLibraryMovesOutfitAndDropsDuplicate(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "OutfitAsset", outfitAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	createLibraryTable(t, db, "PersonaAsset", personaAssetColumns)
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","description","lighting","category","tags","createdAt") VALUES
		('new','local','窗边','','自然采光与清晰物理接触阴影','general','','2026-02-02T00:00:00.000Z'),
		('old','local','窗边','','自然采光与清晰物理接触阴影','general','','2026-01-01T00:00:00.000Z'),
		('look','local','白色西装穿搭','短描述','日光','general','','2026-03-03T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	migrated, cleaned, err := DeduplicateLibrary(context.Background(), db, "local")
	if err != nil || migrated != 1 || cleaned != 1 {
		t.Fatalf("migrated %d cleaned %d %v", migrated, cleaned, err)
	}
	var scenes int
	var outfitTitle, outfitBottom string
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SceneAsset"`).Scan(&scenes); err != nil || scenes != 1 {
		t.Fatalf("scenes %d %v", scenes, err)
	}
	if err := db.QueryRow(`SELECT "title", "bottom" FROM "OutfitAsset"`).Scan(&outfitTitle, &outfitBottom); err != nil || outfitTitle != "白色西装穿搭" || outfitBottom != "高腰垂感半身长裙" {
		t.Fatalf("outfit %s %s %v", outfitTitle, outfitBottom, err)
	}
}

func TestOutfitSimilarityMatchesSharedColorAndGarment(t *testing.T) {
	score := outfitSimilarity(
		outfitFields{title: "奶白蕾丝连衣裙", top: "蕾丝", bottom: "长裙"},
		outfitFields{title: "纯白蕾丝长裙", top: "蕾丝吊带", bottom: "裙装"},
	)
	if score < 0.7 {
		t.Fatalf("score %v", score)
	}
	if outfitSimilarity(outfitFields{title: "纯黑西装"}, outfitFields{title: "纯白西装"}) != 0.15 {
		t.Fatal("color conflict")
	}
}

func TestSanitizeScenePromptRemovesPerson(t *testing.T) {
	cleaned := sanitizeScenePrompt("一位年轻金发女子，站在窗边")
	if strings.Contains(cleaned, "女子") || strings.Contains(cleaned, "金发") {
		t.Fatalf("cleaned %s", cleaned)
	}
}
