package database

import (
	"context"
	"testing"
	"time"
)

func TestLookupImportSourceReadsReviewAndDropsEmptyApproval(t *testing.T) {
	db := openLibraryUpdateDB(t)
	if _, err := db.Exec(`CREATE TABLE "PromptImportSource" (
		"workspaceId" TEXT, "sourceKey" TEXT, "requestId" TEXT, "state" TEXT, "albumName" TEXT, "albumId" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructReview" ("workspaceId" TEXT, "id" TEXT, "status" TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptAsset" ("workspaceId" TEXT, "albumId" TEXT)`); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := db.Exec(`INSERT INTO "PromptImportSource" ("workspaceId","sourceKey","requestId","state","albumName","albumId","updatedAt") VALUES
		('local','xhs:abc','req','pending','图集',NULL,?),
		('local','xhs:gone','old','approved','空图集','album',?)`, now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "DeconstructReview" ("workspaceId","id","status") VALUES ('local','req','needs_fix')`); err != nil {
		t.Fatal(err)
	}
	row, err := LookupImportSource(context.Background(), db, "local", "xhs:abc")
	if err != nil || row.State != "needs_fix" || row.AlbumName != "图集" {
		t.Fatalf("review %#v %v", row, err)
	}
	row, err = LookupImportSource(context.Background(), db, "local", "xhs:gone")
	if err != nil || row.Found {
		t.Fatalf("empty approval %#v %v", row, err)
	}
}
