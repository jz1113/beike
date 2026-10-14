package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
	"testing"
)

func TestListRecentPromptRecordsParsesShots(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "prompts.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "PromptRecord" (
		"id" TEXT PRIMARY KEY,
		"workspaceId" TEXT NOT NULL,
		"productId" TEXT,
		"productTitle" TEXT,
		"productFingerprint" TEXT,
		"modelUsed" TEXT,
		"styleName" TEXT,
		"promptsJson" TEXT NOT NULL,
		"createdAt" DATETIME NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptRecord" ("id","workspaceId","productTitle","promptsJson","createdAt") VALUES
		('old','local','旧记录','["a"]','2026-01-01T00:00:00.000Z'),
		('new','local','新记录','["a","b"]','2026-02-01T00:00:00.000Z'),
		('other','elsewhere','别人的','[]','2026-03-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	records, err := ListRecentPromptRecords(context.Background(), db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[0]["id"] != "new" || records[0]["shotCount"] != 2 {
		t.Fatalf("records %#v", records)
	}
}
