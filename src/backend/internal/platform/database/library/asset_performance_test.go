package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestReadAssetPerformanceUpdatesRegistry(t *testing.T) {
	db := openPerformanceDB(t)
	if _, err := db.Exec(`INSERT INTO "PromptAssetRegistry" ("id","workspaceId","assetType","sourceAssetId","status","version","disabledReason") VALUES
		('reg','local','outfit','asset-1','published',3,'旧原因')`); err != nil {
		t.Fatal(err)
	}
	insertEvents(t, db, "local", "asset-1", []string{
		"generation_submitted", "generation_submitted", "generation_submitted", "generation_submitted", "generation_submitted",
		"generation_submitted", "generation_submitted", "generation_submitted", "generation_submitted", "generation_submitted",
		"generation_succeeded", "generation_succeeded", "generation_succeeded", "generation_succeeded", "generation_succeeded",
		"generation_succeeded", "generation_succeeded", "generation_succeeded", "generation_succeeded", "generation_succeeded",
		"retry_requested", "retry_requested", "retry_requested", "retry_requested", "retry_requested",
		"retry_requested", "retry_requested", "retry_requested", "retry_requested", "retry_requested",
		"ignored",
	})
	if _, err := db.Exec(`INSERT INTO "PromptAssetUsageEvent" ("id","workspaceId","assetId","eventType","createdAt") VALUES
		('other','other','asset-1','output_accepted','2026-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	performance, err := ReadAssetPerformance(context.Background(), db, "local", "asset-1")
	if err != nil {
		t.Fatal(err)
	}
	if performance.Counts.Submitted != 10 || performance.Counts.Succeeded != 10 || performance.Counts.Retried != 10 || performance.Counts.Accepted != 0 {
		t.Fatalf("counts %#v", performance.Counts)
	}
	if performance.RetryRate != 1 || performance.Quality == nil || performance.Quality.Status != "needs_fix" || performance.Quality.LowSample {
		t.Fatalf("performance %#v", performance)
	}
	var reason sql.NullString
	var status string
	var confidence float64
	if err := db.QueryRow(`SELECT "status", "disabledReason", "confidence" FROM "PromptAssetRegistry" WHERE "id" = 'reg'`).Scan(&status, &reason, &confidence); err != nil {
		t.Fatal(err)
	}
	if status != "needs_fix" || reason.Valid || confidence != performance.Quality.Confidence {
		t.Fatalf("stored status %s reason %#v confidence %v", status, reason, confidence)
	}
}

func TestReadAssetPerformanceWithoutRegistry(t *testing.T) {
	db := openPerformanceDB(t)
	performance, err := ReadAssetPerformance(context.Background(), db, "local", "missing")
	if err != nil {
		t.Fatal(err)
	}
	if performance.Quality != nil || performance.FirstPassAcceptRate != 0 || performance.Counts.Submitted != 0 {
		t.Fatalf("performance %#v", performance)
	}
}

func openPerformanceDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "performance.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "PromptAssetUsageEvent" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
		"eventType" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAssetRegistry" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "assetType" TEXT NOT NULL, "sourceAssetId" TEXT NOT NULL,
		"status" TEXT NOT NULL, "version" INTEGER NOT NULL, "disabledReason" TEXT,
		"qualityScore" REAL, "confidence" REAL, "publishedAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	return db
}

func insertEvents(t *testing.T, db *sql.DB, workspace, assetID string, events []string) {
	t.Helper()
	for index, eventType := range events {
		if _, err := db.Exec(`INSERT INTO "PromptAssetUsageEvent" ("id","workspaceId","assetId","eventType","createdAt") VALUES (?,?,?,?,?)`,
			index, workspace, assetID, eventType, "2026-01-02T00:00:00.000Z"); err != nil {
			t.Fatal(err)
		}
	}
}
