package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestListDeconstructReviewsFiltersStatus(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "reviews.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "DeconstructReview" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "albumName" TEXT NOT NULL,
		"payload" TEXT NOT NULL, "status" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "DeconstructReview" ("id","workspaceId","albumName","payload","status","createdAt") VALUES
		('new','local','新图集','{"ok":true}','pending','2026-02-01T00:00:00.000Z'),
		('old','local','旧图集','{"ok":false}','rejected','2026-01-01T00:00:00.000Z'),
		('other','elsewhere','别人的','{}','pending','2026-03-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	pending, err := ListDeconstructReviews(context.Background(), db, "local", "pending")
	if err != nil || len(pending) != 1 || pending[0]["id"] != "new" {
		t.Fatalf("pending %#v err %v", pending, err)
	}
	payload, _ := pending[0]["payload"].(map[string]any)
	if payload["ok"] != true {
		t.Fatalf("payload %#v", pending[0]["payload"])
	}
	if err := UpdateDeconstructReviewStatus(context.Background(), db, "local", "new", "pending", "rejected"); err != nil {
		t.Fatal(err)
	}
	if err := UpdateDeconstructReviewStatus(context.Background(), db, "local", "old", "pending", "rejected"); err != nil {
		t.Fatal(err)
	}
	rejected, err := ListDeconstructReviews(context.Background(), db, "local", "rejected")
	if err != nil || len(rejected) != 2 {
		t.Fatalf("rejected %#v err %v", rejected, err)
	}
	var oldStatus string
	if err := db.QueryRow(`SELECT "status" FROM "DeconstructReview" WHERE "id" = 'old'`).Scan(&oldStatus); err != nil {
		t.Fatal(err)
	}
	if oldStatus != "rejected" {
		t.Fatalf("status %s", oldStatus)
	}
}
