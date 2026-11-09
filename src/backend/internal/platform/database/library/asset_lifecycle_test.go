package library

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/platform/database"
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
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "lifecycle.db"))
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

func TestListDeconstructReviewsFiltersStatus(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "reviews.db"))
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

func TestDuplicateSourceAlbumGroups(t *testing.T) {
	db, err := database.OpenWrite(filepath.Join(t.TempDir(), "sources.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "FullPromptAsset" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "albumId" TEXT, "sourceImages" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "PromptAlbum" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "PromptAlbum" ("id","workspaceId","name") VALUES
		('a','local','图集甲'), ('b','official','图集乙'), ('c','other','别人的')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO "FullPromptAsset" ("id","workspaceId","albumId","sourceImages") VALUES
		('1','local','a','["same"]'), ('2','local','b','["same"]'), ('3','local','c','["same"]'),
		('4','local','a','[]')`); err != nil {
		t.Fatal(err)
	}
	groups, err := DuplicateSourceAlbumGroups(context.Background(), db, "local")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || len(groups[0]) != 2 {
		t.Fatalf("groups %#v", groups)
	}
}

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
