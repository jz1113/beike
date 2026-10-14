package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestApplyAssetLifecycleDisableAndVersion(t *testing.T) {
	db := openLifecycleDB(t)
	if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry" (
		"id","workspaceId","assetType","sourceAssetId","status","version","provenance","createdAt","updatedAt"
	) VALUES ('reg','local','outfit','asset-1','published',2,'manual','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	disabled, err := ApplyAssetLifecycle(context.Background(), db, "local", "outfit", "asset-1", "disable", "季节过期")
	if err != nil || disabled.Status != "disabled" || disabled.DisabledReason == nil || *disabled.DisabledReason != "季节过期" {
		t.Fatalf("disabled %#v err %v", disabled, err)
	}
	if _, err := ApplyAssetLifecycle(context.Background(), db, "local", "outfit", "asset-1", "submit-review", ""); err == nil {
		t.Fatal("disabled 资产不能直接提交审核")
	}
	created, err := ApplyAssetLifecycle(context.Background(), db, "local", "outfit", "asset-1", "create-version", "")
	if err != nil || created.Version != 3 || created.Status != "pending_review" || created.DisabledReason != nil {
		t.Fatalf("version %#v err %v", created, err)
	}
}

func TestApplyAssetLifecycleCreatesPublishedRegistry(t *testing.T) {
	db := openLifecycleDB(t)
	row, err := ApplyAssetLifecycle(context.Background(), db, "local", "scene", "missing", "disable", "")
	if err != nil || row.Status != "disabled" || row.Version != 1 || row.Provenance != "manual" || row.DisabledReason == nil || *row.DisabledReason != "人工停用" {
		t.Fatalf("row %#v err %v", row, err)
	}
	if _, err := ApplyAssetLifecycle(context.Background(), db, "local", "scene", "missing", "submit-review", ""); err == nil || err.(*LifecycleError).Status != 409 {
		t.Fatalf("err %#v", err)
	}
}

func openLifecycleDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenWrite(filepath.Join(t.TempDir(), "lifecycle.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "PromptAssetRegistry" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetType" TEXT NOT NULL, "sourceAssetId" TEXT NOT NULL,
		"status" TEXT NOT NULL, "version" INTEGER NOT NULL, "provenance" TEXT NOT NULL,
		"sourceRef" TEXT, "qualityScore" REAL, "confidence" REAL, "publishedAt" TEXT, "disabledReason" TEXT,
		"createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL,
		UNIQUE ("workspaceId", "assetType", "sourceAssetId")
	)`); err != nil {
		t.Fatal(err)
	}
	return db
}
