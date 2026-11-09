package library

import (
	"context"
	"strings"
	"testing"
)

func TestLibraryDetailReportsOutfitAndPersona(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "OutfitAsset", outfitAssetColumns)
	createLibraryTable(t, db, "PersonaAsset", personaAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	if _, err := db.Exec(`CREATE TABLE "PromptAssetRegistry" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "assetType" TEXT, "sourceAssetId" TEXT,
		"status" TEXT, "version" INTEGER, "provenance" TEXT, "sourceRef" TEXT,
		"qualityScore" REAL, "confidence" REAL, "publishedAt" TEXT, "disabledReason" TEXT,
		"createdAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "OutfitAsset" ("id","workspaceId","title","top","provenance") VALUES
		('shirt','local','白衬衫','白色衬衫','manual'),
		('cuff','local','袖口','','manual'),
		('official','official','官方衬衫','白色衬衫','manual'),
		('other','elsewhere','别人的','白色衬衫','manual')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PersonaAsset" ("id","workspaceId","name","provenance") VALUES ('empty','local','无人物','manual')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "ActionAsset" ("id","workspaceId","title","provenance") VALUES ('pose','local','侧颜','manual')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry"
		("id","workspaceId","assetType","sourceAssetId","status","version","provenance","createdAt","updatedAt")
		VALUES ('reg','local','action','pose','disabled',1,'manual','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	shirt, err := LibraryDetail(context.Background(), db, "local", "outfit", "shirt")
	if err != nil || !strings.Contains(string(shirt), `"contentEligible":true`) || strings.Contains(string(shirt), `"registry"`) {
		t.Fatalf("shirt %s %v", shirt, err)
	}
	cuff, err := LibraryDetail(context.Background(), db, "local", "outfit", "cuff")
	if err != nil || !strings.Contains(string(cuff), `"contentEligible":false`) || !strings.Contains(string(cuff), "仅有衣物局部") {
		t.Fatalf("cuff %s %v", cuff, err)
	}
	official, err := LibraryDetail(context.Background(), db, "local", "outfit", "official")
	if err != nil || !strings.Contains(string(official), `"title":"官方衬衫"`) {
		t.Fatalf("official %s %v", official, err)
	}
	if _, err := LibraryDetail(context.Background(), db, "local", "outfit", "other"); err != ErrLibraryDetailMissing {
		t.Fatalf("other %v", err)
	}
	persona, err := LibraryDetail(context.Background(), db, "local", "persona", "empty")
	if err != nil || !strings.Contains(string(persona), "没有可辨识的人物面部") {
		t.Fatalf("persona %s %v", persona, err)
	}
	action, err := LibraryDetail(context.Background(), db, "local", "action", "pose")
	if err != nil || !strings.Contains(string(action), `"status":"disabled"`) || !strings.Contains(string(action), "资产尚未发布或已停用") {
		t.Fatalf("action %s %v", action, err)
	}
}

func TestLibrarySceneDetailUsesActionsThenTemplates(t *testing.T) {
	db := openLibraryUpdateDB(t)
	createLibraryTable(t, db, "SceneAsset", sceneAssetColumns)
	createLibraryTable(t, db, "ActionAsset", actionAssetColumns)
	if _, err := db.Exec(`INSERT INTO "SceneAsset" ("id","workspaceId","title","description","provenance") VALUES
		('room','local','窗边','安静的房间','manual'),
		('ride','local','车内随拍','副驾看风景','manual'),
		('ear','local','耳饰特写','耳环在窗边','manual'),
		('official','official','官方场景','客厅','manual')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "ActionAsset"
		("id","workspaceId","title","action","shotType","shotOrder","sceneId","provenance","createdAt") VALUES
		('late','local','后镜','后一个动作','half_body',2,'room','manual','2026-01-02T00:00:00.000Z'),
		('early','local','前镜','前一个动作','half_body',1,'room','manual','2026-01-03T00:00:00.000Z'),
		('fifth','local','第五镜','超出的动作','half_body',5,'room','manual','2026-01-04T00:00:00.000Z'),
		('third','local','第三镜','第三个动作','half_body',3,'room','manual','2026-01-05T00:00:00.000Z'),
		('fourth','local','第四镜','第四个动作','half_body',4,'room','manual','2026-01-06T00:00:00.000Z'),
		('foreign','elsewhere','别人的','不该出现','half_body',1,'room','manual','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	room, err := LibrarySceneDetail(context.Background(), db, "local", "room")
	if err != nil || !strings.Contains(string(room), `"shotCount":4`) {
		t.Fatalf("room %s %v", room, err)
	}
	body := string(room)
	shotsAt := strings.Index(body, `"shots":`)
	if shotsAt < 0 || !strings.Contains(body[:shotsAt], `"id":"fifth"`) || strings.Contains(body[shotsAt:], `"id":"fifth"`) {
		t.Fatalf("shot trim %s", room)
	}
	if strings.Index(body[shotsAt:], `"id":"early"`) > strings.Index(body[shotsAt:], `"id":"late"`) {
		t.Fatalf("shot order %s", room)
	}
	if strings.Contains(string(room), "别人的") {
		t.Fatalf("foreign action leaked %s", room)
	}
	ride, err := LibrarySceneDetail(context.Background(), db, "local", "ride")
	if err != nil || !strings.Contains(string(ride), `"title":"车内随行抓拍"`) || !strings.Contains(string(ride), `"shotCount":4`) || !strings.Contains(string(ride), `"provenance":"harmonized"`) {
		t.Fatalf("ride %s %v", ride, err)
	}
	ear, err := LibrarySceneDetail(context.Background(), db, "local", "ear")
	if err != nil || !strings.Contains(string(ear), "耳际局部超清微距特写") {
		t.Fatalf("ear %s %v", ear, err)
	}
	official, err := LibrarySceneDetail(context.Background(), db, "local", "official")
	if err != nil || !strings.Contains(string(official), `"title":"官方场景"`) {
		t.Fatalf("official %s %v", official, err)
	}
	if _, err := LibrarySceneDetail(context.Background(), db, "local", "missing"); err != ErrLibraryDetailMissing {
		t.Fatalf("missing %v", err)
	}
}

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

func TestListPromptGroupsUsesLibraryNumbers(t *testing.T) {
	db := openPromptCreateDB(t)
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"motherAssetId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset"
		("id","workspaceId","title","provenance","groupIndex","createdAt","isFavorite","usageCount") VALUES
		('later','local','街景母组','manual',1,'2026-01-02T00:00:00.000Z',0,0),
		('early','local','窗边母组','manual',1,'2026-01-01T00:00:00.000Z',1,9),
		('old','local','旧单图','legacy_single',NULL,'2026-01-03T00:00:00.000Z',1,9),
		('raw','local','未成组','deconstructed',NULL,'2026-01-04T00:00:00.000Z',1,9)`); err != nil {
		t.Fatal(err)
	}
	list, err := ListLibraryAssets(context.Background(), db, "local", "full_prompt", 1, 1, "", false, "", "", true, "")
	if err != nil || list.Total != 2 || len(list.Items) != 1 || !strings.Contains(string(list.Items[0]), `"id":"early"`) || !strings.Contains(string(list.Items[0]), `"displayNumber":1`) || !strings.Contains(string(list.Items[0]), `"code":"R-arly"`) {
		t.Fatalf("page %d %#v %v", list.Total, list.Items, err)
	}
	keyword, err := ListLibraryAssets(context.Background(), db, "local", "full_prompt", 1, 50, "街景", false, "", "", true, "")
	if err != nil || keyword.Total != 1 || !strings.Contains(string(keyword.Items[0]), `"id":"later"`) {
		t.Fatalf("keyword %d %#v %v", keyword.Total, keyword.Items, err)
	}
}
