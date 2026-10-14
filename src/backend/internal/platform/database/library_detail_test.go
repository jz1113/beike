package database

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
