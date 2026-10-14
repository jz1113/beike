package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"path/filepath"
	"testing"
)

func TestMotherReplacementState(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "mothers.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "FullPromptAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "groupIndex" INTEGER,
		"shotPromptsJson" TEXT, "provenance" TEXT, "sourceImages" TEXT, "sourceImageIndices" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "FullPromptImageReplacement" (
		"motherAssetId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "reviewId" TEXT NOT NULL, "createdAt" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	shots := `[{"shot_no":1},{"shot_no":2},{"shot_no":3},{"shot_no":4}]`
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","groupIndex","shotPromptsJson","provenance","sourceImages","sourceImageIndices") VALUES
		('open','local',1,?,'deconstructed','["a","b","c","d"]','[1,2,3,4]'),
		('done','local',1,?,'deconstructed','["a"]','[1]')`, shots, shots); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptImageReplacement" ("motherAssetId","workspaceId","reviewId","createdAt") VALUES
		('done','local','review','2026-03-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	open, err := MotherReplacementState(context.Background(), db, "local", "open")
	if err != nil || !open.Found || open.Replaced || !open.Replaceable || len(open.SourceImages) != 4 {
		t.Fatalf("open %#v err %v", open, err)
	}
	done, err := MotherReplacementState(context.Background(), db, "local", "done")
	if err != nil || !done.Replaced || done.Replaceable || done.ReplacedAt == nil {
		t.Fatalf("done %#v err %v", done, err)
	}
	missing, err := MotherReplacementState(context.Background(), db, "local", "absent")
	if err != nil || missing.Found {
		t.Fatalf("missing %#v err %v", missing, err)
	}
}
