package catalog

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestArchiveMajorFolderReleasesReferences(t *testing.T) {
	db := openFolderDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]'),
		('child','local','子类','jewelry',1,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name","sourceKey","productCategoryId","createdAt") VALUES
		('album','local','图集','album','jewelry','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","albumId","productCategoryIds","productSubcategory","isUniversal","updatedAt") VALUES
		('grouped','local','album','["child"]','旧',0,NULL),
		('loose','local',NULL,'["child"]','旧',0,NULL)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","productCategoryIds","isUniversal") VALUES
		('scene','local','["jewelry","keep"]',0)`); err != nil {
		t.Fatal(err)
	}
	result, err := ArchivePromptFolders(context.Background(), db, "local", []string{"jewelry"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.ArchivedCount != 1 || result.ReleasedCount != 1 {
		t.Fatalf("counts %#v", result)
	}
	var archived, childArchived int
	if err := db.QueryRow(`SELECT "isArchived" FROM "AssetProductCategory" WHERE "id" = 'jewelry'`).Scan(&archived); err != nil || archived != 1 {
		t.Fatalf("archived %d err %v", archived, err)
	}
	if err := db.QueryRow(`SELECT "isArchived" FROM "AssetProductCategory" WHERE "id" = 'child'`).Scan(&childArchived); err != nil || childArchived != 0 {
		t.Fatalf("child archived %d", childArchived)
	}
	var albumCategory interface{}
	if err := db.QueryRow(`SELECT "productCategoryId" FROM "PromptAlbum" WHERE "id" = 'album'`).Scan(&albumCategory); err != nil || albumCategory != nil {
		t.Fatalf("album %#v err %v", albumCategory, err)
	}
	assertGroup(t, db, "loose", "[]", false, "")
	var sceneCategories string
	if err := db.QueryRow(`SELECT "productCategoryIds" FROM "SceneAsset" WHERE "id" = 'scene'`).Scan(&sceneCategories); err != nil || sceneCategories != `["keep"]` {
		t.Fatalf("scene %s err %v", sceneCategories, err)
	}
}

func TestArchiveBuiltinSubfolder(t *testing.T) {
	db := openFolderDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('digital_3c','local','数码',NULL,0,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","albumId","productCategoryIds","productSubcategory","isUniversal","updatedAt") VALUES
		('group','local',NULL,'["digital_3c"]','phone',0,NULL)`); err != nil {
		t.Fatal(err)
	}
	parent := "digital_3c"
	result, err := ArchivePromptFolders(context.Background(), db, "local", []string{"phone"}, &parent)
	if err != nil {
		t.Fatal(err)
	}
	if result.ReleasedCount != 1 {
		t.Fatalf("released %d", result.ReleasedCount)
	}
	var name string
	var archived int
	if err := db.QueryRow(`SELECT "name", "isArchived" FROM "AssetProductCategory" WHERE "id" = 'prompt_subcategory:digital_3c:phone'`).Scan(&name, &archived); err != nil || name != "手机本体" || archived != 1 {
		t.Fatalf("folder %s archived %d err %v", name, archived, err)
	}
	assertGroup(t, db, "group", `["digital_3c"]`, false, "")
}

func openFolderDB(t *testing.T) *sql.DB {
	t.Helper()
	db := openPromptGroupDB(t)
	for _, table := range []string{"PersonaAsset", "SceneAsset", "OutfitAsset", "ActionAsset"} {
		if _, err := db.Exec(`CREATE TABLE "` + table + `" (
			"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "productCategoryIds" TEXT NOT NULL, "isUniversal" INTEGER NOT NULL
		)`); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func TestSaveAndImportPromptFolderRules(t *testing.T) {
	db := openFolderDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('digital_3c','local','数码',NULL,0,0,'[]','[]','[]'),
		('jewelry','local','珠宝',NULL,1,0,'[]','[]','[]'),
		('neck','local','项链','jewelry',0,0,'[]','["甲"]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := SavePromptFolderRules(context.Background(), db, "local", "prompt_subcategory:digital_3c:phone", []string{" 项链 ", "项链"}, []string{"链"}); err != nil {
		t.Fatal(err)
	}
	var name, keywords, anatomy, parent string
	if err := db.QueryRow(`SELECT "name", "parentId", "keywords", "anatomy" FROM "AssetProductCategory" WHERE "id" = 'prompt_subcategory:digital_3c:phone'`).Scan(&name, &parent, &keywords, &anatomy); err != nil {
		t.Fatal(err)
	}
	if name != "手机本体" || parent != "digital_3c" || keywords != `["项链"]` || anatomy != `["链"]` {
		t.Fatalf("builtin %s %s %s %s", name, parent, keywords, anatomy)
	}
	if _, err := SavePromptFolderRules(context.Background(), db, "local", "universal", nil, nil); err == nil || err.Error() != "系统虚拟分类不可编辑规则" {
		t.Fatalf("virtual %v", err)
	}
	parentID := "jewelry"
	result, err := ImportPromptFolderRules(context.Background(), db, "local", parentID, "append", []FolderRuleItem{
		{Name: "项链", Keywords: []string{"乙"}},
		{Name: "手链", Keywords: []string{"手"}, HasAnatomy: true, Anatomy: []string{"腕"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.CreatedCount != 1 || result.UpdatedCount != 1 {
		t.Fatalf("import %#v", result)
	}
	if err := db.QueryRow(`SELECT "keywords" FROM "AssetProductCategory" WHERE "id" = 'neck'`).Scan(&keywords); err != nil || keywords != `["甲","乙"]` {
		t.Fatalf("merged %s err %v", keywords, err)
	}
	if err := db.QueryRow(`SELECT "anatomy" FROM "AssetProductCategory" WHERE "name" = '手链'`).Scan(&anatomy); err != nil || anatomy != `["腕"]` {
		t.Fatalf("created anatomy %s err %v", anatomy, err)
	}
}

func TestSavePromptSubcategory(t *testing.T) {
	db := openFolderDB(t)
	if _, err := db.Exec(`INSERT INTO "AssetProductCategory" ("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy") VALUES
		('jewelry','local','珠宝',NULL,0,0,'[]','[]','[]'),
		('digital_3c','local','数码',NULL,1,0,'[]','[]','[]'),
		('official','official','官方',NULL,2,0,'[]','[]','[]')`); err != nil {
		t.Fatal(err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", "", "定制"); err != nil {
		t.Fatal(err)
	}
	var id, parent string
	if err := db.QueryRow(`SELECT "id", "parentId" FROM "AssetProductCategory" WHERE "name" = '定制'`).Scan(&id, &parent); err != nil {
		t.Fatal(err)
	}
	if parent != "jewelry" || !strings.HasPrefix(id, "prompt_subcategory:") {
		t.Fatalf("custom %s %s", id, parent)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", id, "定制夹"); err != nil {
		t.Fatal(err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", "", "定制夹"); err == nil || err.Error() != "同级文件夹名称已存在" {
		t.Fatalf("duplicate %v", err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "jewelry", "phone", "手机"); err == nil || err.Error() != "数码细分只能用于手机数码" {
		t.Fatalf("phone %v", err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "digital_3c", "", "手机本体"); err != nil {
		t.Fatal(err)
	}
	var builtin string
	if err := db.QueryRow(`SELECT "id" FROM "AssetProductCategory" WHERE "name" = '手机本体'`).Scan(&builtin); err != nil || builtin != "prompt_subcategory:digital_3c:phone" {
		t.Fatalf("builtin %s err %v", builtin, err)
	}
	if _, err := SavePromptSubcategory(context.Background(), db, "local", "official", "", "新文件夹"); err == nil || err.Error() != "商品大类不存在或不可编辑" {
		t.Fatalf("official %v", err)
	}
}
