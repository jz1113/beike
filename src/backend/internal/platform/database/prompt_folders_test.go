package database

import (
	"context"
	"database/sql"
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
