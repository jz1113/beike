package poster

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/platform/database"
)

func learningDB(t *testing.T) *sql.DB {
	t.Helper()
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
func learningExec(t *testing.T, db *sql.DB, query string, args ...any) {
	t.Helper()
	if _, err := db.ExecContext(t.Context(), query, args...); err != nil {
		t.Fatal(err)
	}
}
func learningEntry(id, sample, rule string) coverEntry {
	return coverEntry{ID: id, SampleID: sample, Branch: "layout", Rule: rule, Status: "adopted", Source: "sample"}
}

func TestLearningOldSampleAndCompletePagination(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i := 0; i < 235; i++ {
		id := fmt.Sprintf("sample_%03d", i)
		if err := insertCoverSample(t.Context(), db, "local", id, id, "model", []string{"/storage/a.png"}); err != nil {
			t.Fatal(err)
		}
		if err := insertCoverEntries(t.Context(), db, "local", []coverEntry{learningEntry(id, id, "保留这一张的结构")}); err != nil {
			t.Fatal(err)
		}
	}
	learningExec(t, db, `UPDATE "CoverMemoryEntry" SET "createdAt"='2000-01-01T00:00:00Z' WHERE "id"='sample_000'`)
	_, ids, selected, err := adoptedCoverSelection(t.Context(), db, "local", "sample_000", "手表")
	if err != nil || selected != "sample_000" || len(ids) != 1 || ids[0] != "sample_000" {
		t.Fatalf("old sample %s %v %v", selected, ids, err)
	}
	seen := map[string]bool{}
	samples := map[string]bool{}
	for offset := 0; ; offset += 100 {
		rec := httptest.NewRecorder()
		HeadlineMemory(cfg).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/?offset=%d", offset), nil))
		var page struct {
			Entries    []coverEntry
			Samples    []coverSample
			NextOffset *int
		}
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &page) != nil {
			t.Fatalf("page %d %s", rec.Code, rec.Body.String())
		}
		for _, e := range page.Entries {
			if seen[e.ID] {
				t.Fatalf("duplicate %s", e.ID)
			}
			seen[e.ID] = true
		}
		for _, s := range page.Samples {
			samples[s.ID] = true
		}
		if page.NextOffset == nil {
			break
		}
		if *page.NextOffset != offset+100 {
			t.Fatal("non advancing page")
		}
	}
	if len(seen) != 235 || len(samples) != 235 {
		t.Fatalf("counts %d %d", len(seen), len(samples))
	}
}

func TestLearningUsageAtomicAndIdempotent(t *testing.T) {
	db := learningDB(t)
	ctx := t.Context()
	if err := insertCoverEntries(ctx, db, "local", []coverEntry{learningEntry("a", "sample", "标题靠上"), learningEntry("b", "sample", "保留轮廓")}); err != nil {
		t.Fatal(err)
	}
	learningExec(t, db, `CREATE TRIGGER fail_use BEFORE UPDATE OF "useCount" ON "CoverMemoryEntry" WHEN NEW."id"='b' BEGIN SELECT RAISE(ABORT,'blocked'); END`)
	ids := []string{"a", "b", "a"}
	sheet := map[string]string{"layout": "靠上"}
	if err := recordCoverUsage(ctx, db, "local", "batch", "item", "标题", ids, sheet); err == nil {
		t.Fatal("expected failed usage transaction")
	}
	var count, uses int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryUsage"`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT SUM("useCount") FROM "CoverMemoryEntry"`).Scan(&uses); err != nil {
		t.Fatal(err)
	}
	if count != 0 || uses != 0 {
		t.Fatalf("partial write %d %d", count, uses)
	}
	learningExec(t, db, `DROP TRIGGER fail_use`)
	for i := 0; i < 2; i++ {
		if err := recordCoverUsage(ctx, db, "local", "batch", "item", "标题", ids, sheet); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryUsage"`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT SUM("useCount") FROM "CoverMemoryEntry"`).Scan(&uses); err != nil {
		t.Fatal(err)
	}
	if count != 1 || uses != 2 {
		t.Fatalf("duplicate usage %d %d", count, uses)
	}
}

func TestLearningRevisionRollbackAndRetrySnapshot(t *testing.T) {
	db := learningDB(t)
	ctx := t.Context()
	if err := insertCoverEntries(ctx, db, "local", []coverEntry{learningEntry("old", "watch", "保留表盘")}); err != nil {
		t.Fatal(err)
	}
	if err := mutateCoverExperience(ctx, db, "local", "加入纠正", func(tx *sql.Tx) error {
		return insertCoverEntries(ctx, tx, "local", []coverEntry{{ID: "fix", Branch: "correction", Rule: "不要挡住品牌", Source: "correction", Status: "adopted"}})
	}); err != nil {
		t.Fatal(err)
	}
	revisions, err := listCoverRevisions(ctx, db, "local", 0)
	if err != nil || len(revisions) != 2 {
		t.Fatalf("revisions %v %v", revisions, err)
	}
	memory, err := readDesignMemory(ctx, db, "local", "watch", "手表", "", "batch", "item")
	if err != nil {
		t.Fatal(err)
	}
	usageID, err := saveDesignMemory(ctx, db, "local", "batch", "item", "手表", memory, map[string]any{"layout": "保留品牌"})
	if err != nil {
		t.Fatal(err)
	}
	learningExec(t, db, `DELETE FROM "CoverMemoryEntry" WHERE "id"='old'`)
	learningExec(t, db, `UPDATE "CoverMemoryEntry" SET "rule"='后来改成的规则' WHERE "id"='fix'`)
	saved, err := readDesignMemory(ctx, db, "local", "missing", "台灯", usageID, "batch", "item")
	if err != nil || strings.Join(saved.Lines, "\n") != strings.Join(memory.Lines, "\n") || saved.RevisionID != memory.RevisionID {
		t.Fatalf("snapshot %#v %v", saved, err)
	}
	for _, owner := range []struct{ workspace, batch, item string }{{"other", "batch", "item"}, {"local", "different", "item"}, {"local", "batch", "different"}} {
		if _, err := readDesignMemory(ctx, db, owner.workspace, "auto", "", usageID, owner.batch, owner.item); err == nil {
			t.Fatal("snapshot crossed ownership")
		}
	}
	if err := restoreCoverRevision(ctx, db, "local", revisions[1].ID); err != nil {
		t.Fatal(err)
	}
	entries, err := adoptedSnapshotInTest(ctx, db, "local")
	if err != nil || len(entries) != 1 || entries[0].ID != "old" {
		t.Fatalf("restore %v %v", entries, err)
	}
	var oldCreated string
	if err := db.QueryRow(`SELECT "createdAt" FROM "CoverMemoryEntry" WHERE "id"='old'`).Scan(&oldCreated); err != nil {
		t.Fatal(err)
	}
	if oldCreated != entries[0].CreatedAt {
		t.Fatal("created timestamp lost")
	}
	if err := restoreCoverRevision(ctx, db, "other", revisions[1].ID); err != sql.ErrNoRows {
		t.Fatalf("cross workspace restore %v", err)
	}
	revisions, err = listCoverRevisions(ctx, db, "local", 0)
	if err != nil {
		t.Fatal(err)
	}
	before := len(revisions)
	if err := mutateCoverExperience(ctx, db, "local", "no change", func(*sql.Tx) error { return nil }); err != nil {
		t.Fatal(err)
	}
	after, err := listCoverRevisions(ctx, db, "local", 0)
	if err != nil || len(after) != before {
		t.Fatalf("no-op revision %v %v", after, err)
	}
}
func adoptedSnapshotInTest(ctx context.Context, db *sql.DB, workspace string) ([]coverEntry, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	return adoptedSnapshot(ctx, tx, workspace)
}

func TestLearningFailedRevisionUndoesAdoption(t *testing.T) {
	db := learningDB(t)
	e := learningEntry("old", "sample", "标题靠上")
	e.Status = "pending"
	if err := insertCoverEntries(t.Context(), db, "local", []coverEntry{e}); err != nil {
		t.Fatal(err)
	}
	learningExec(t, db, `CREATE TRIGGER fail_revision BEFORE INSERT ON "CoverMemoryRevision" WHEN NEW."entryCount">0 BEGIN SELECT RAISE(ABORT,'blocked'); END`)
	if err := mutateCoverExperience(t.Context(), db, "local", "采纳", func(tx *sql.Tx) error { return setCoverEntryStatus(t.Context(), tx, "local", "old", "adopted") }); err == nil {
		t.Fatal("expected revision failure")
	}
	var status string
	if err := db.QueryRow(`SELECT "status" FROM "CoverMemoryEntry" WHERE "id"='old'`).Scan(&status); err != nil || status != "pending" {
		t.Fatalf("partial adoption %s %v", status, err)
	}
}

func TestFeedbackUpdatesChoiceAndCreatesExplicitCorrection(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, ok := openCoverDB(cfg)
	if !ok {
		t.Fatal("db")
	}
	defer db.Close()
	ctx := t.Context()
	for _, id := range []string{"watch", "lamp"} {
		title := "手表表盘"
		if id == "lamp" {
			title = "台灯书桌"
		}
		if err := insertCoverSample(ctx, db, "local", id, title, "model", nil); err != nil {
			t.Fatal(err)
		}
		if err := insertCoverEntries(ctx, db, "local", []coverEntry{learningEntry(id, id, title)}); err != nil {
			t.Fatal(err)
		}
	}
	learningExec(t, db, `UPDATE "CoverMemoryEntry" SET "createdAt"='2020-01-01T00:00:00Z' WHERE "id"='watch'`)
	_, _, selected, err := adoptedCoverSelection(ctx, db, "local", "auto", "手表测评")
	if err != nil || selected != "watch" {
		t.Fatalf("relevance %s %v", selected, err)
	}
	if err := recordCoverUsage(ctx, db, "local", "batch", "item", "手表", []string{"watch"}, map[string]string{"memorySampleId": "watch"}); err != nil {
		t.Fatal(err)
	}
	usages, err := listCoverUsages(ctx, db, "local")
	if err != nil {
		t.Fatal(err)
	}
	handler := HeadlineMemoryFeedback(cfg)
	post := func(body, id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))
		req.SetPathValue("id", id)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}
	for i := 0; i < 2; i++ {
		rec := post(`{"rating":"good","note":"边缘清晰","correction":"不要遮挡品牌"}`, usages[0].ID)
		if rec.Code != 200 {
			t.Fatalf("feedback %d %s", rec.Code, rec.Body.String())
		}
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryEntry" WHERE "source"='correction'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate correction %d %v", count, err)
	}
	_, _, selected, err = adoptedCoverSelection(ctx, db, "local", "auto", "未知商品")
	if err != nil || selected != "watch" {
		t.Fatalf("feedback tie break %s %v", selected, err)
	}
	_, _, selected, err = adoptedCoverSelection(ctx, db, "local", "lamp", "手表")
	if err != nil || selected != "lamp" {
		t.Fatalf("explicit selection %s %v", selected, err)
	}
	if rec := post(`{"rating":"bad","note":"test"}`, "missing"); rec.Code != 404 {
		t.Fatalf("missing feedback %d", rec.Code)
	}
	if rec := post(`{"rating":"anything"}`, usages[0].ID); rec.Code != 400 {
		t.Fatalf("bad rating %d", rec.Code)
	}
}

// Reproduce the old failure without depending on the clock's fractional precision.
func seedRevisionOrder(t *testing.T, db *sql.DB) []string {
	t.Helper()
	stamps := []string{"2026-11-04T17:01:10Z", "2026-11-04T17:01:10.6039Z", "2026-11-04T17:01:10.603975Z", "2026-11-04T17:01:10.603975001Z"}
	ids := []string{}
	for i, stamp := range stamps {
		id := fmt.Sprintf("revision_%d", i)
		learningExec(t, db, `INSERT INTO "CoverMemoryRevision" ("id","workspaceId","reason","fingerprint","snapshot","markdown","entryCount","sampleCount","createdAt") VALUES (?,'local','test',?,'[]','',0,0,?)`, id, id, stamp)
		ids = append(ids, id)
	}
	return ids
}

func TestRevisionOrderMixedUTCPrecisionAndWorkspace(t *testing.T) {
	db := learningDB(t)
	ids := seedRevisionOrder(t, db)
	learningExec(t, db, `INSERT INTO "CoverMemoryRevision" SELECT 'other','other',"reason","fingerprint","snapshot","markdown","entryCount","sampleCount",'2099-01-01T00:00:00Z' FROM "CoverMemoryRevision" LIMIT 1`)
	revisions, err := listCoverRevisions(t.Context(), db, "local", 0)
	if err != nil || len(revisions) != len(ids) {
		t.Fatalf("list %v %v", revisions, err)
	}
	for i, revision := range revisions {
		if revision.ID != ids[len(ids)-1-i] {
			t.Fatalf("time order at %d: %v", i, revisions)
		}
	}
	memory, err := readDesignMemory(t.Context(), db, "local", "auto", "", "", "batch", "item")
	if err != nil || memory.RevisionID != ids[len(ids)-1] {
		t.Fatalf("design references stale revision: %v %v", memory, err)
	}
}

func TestRevisionOrderNoChangeUsesActualLatestFingerprint(t *testing.T) {
	db := learningDB(t)
	ids := seedRevisionOrder(t, db)
	// [] is the snapshot of the empty adopted rules. Only the actual latest matches it.
	learningExec(t, db, `UPDATE "CoverMemoryRevision" SET "fingerprint"='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945' WHERE "id"=?`, ids[len(ids)-1])
	if err := mutateCoverExperience(t.Context(), db, "local", "no change", func(*sql.Tx) error { return nil }); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryRevision"`).Scan(&count); err != nil || count != len(ids) {
		t.Fatalf("no-op created revisions: count=%d err=%v", count, err)
	}
}

func TestRevisionOrderEqualInstantsUseInsertionOrder(t *testing.T) {
	db := learningDB(t)
	for _, id := range []string{"revision_9", "revision_10"} {
		learningExec(t, db, `INSERT INTO "CoverMemoryRevision" VALUES (?,'local','test','same','[]','',0,0,'2026-11-04T17:01:10.6039Z')`, id)
	}
	revisions, err := listCoverRevisions(t.Context(), db, "local", 0)
	if err != nil || len(revisions) != 2 || revisions[0].ID != "revision_10" {
		t.Fatalf("equal timestamp order %v %v", revisions, err)
	}
}

func TestRevisionOrderAPIPaginationAndRestore(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	base := time.Date(2026, 11, 4, 17, 1, 10, 603900000, time.UTC)
	for i := 0; i < 105; i++ {
		stamp := base.Add(time.Duration(i) * time.Nanosecond).Format(time.RFC3339Nano)
		learningExec(t, db, `INSERT INTO "CoverMemoryRevision" VALUES (?,'local',?,'unused','[]','',0,0,?)`, fmt.Sprintf("r_%d", i), fmt.Sprintf("reason %d", i), stamp)
	}
	// Read through the API used by the version panel, including the page boundary.
	for _, offset := range []int{0, 100} {
		w := httptest.NewRecorder()
		HeadlineMemory(cfg).ServeHTTP(w, httptest.NewRequest("GET", fmt.Sprintf("/?offset=%d", offset), nil))
		var page struct {
			Revisions  []coverRevision
			NextOffset *int
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &page) != nil {
			t.Fatalf("page %d: %d %s", offset, w.Code, w.Body.String())
		}
		want := min(100, 105-offset)
		if len(page.Revisions) != want || (offset == 0 && (page.NextOffset == nil || *page.NextOffset != 100)) || (offset == 100 && page.NextOffset != nil) {
			t.Fatalf("pagination %d: %+v", offset, page)
		}
		for i, revision := range page.Revisions {
			if revision.ID != fmt.Sprintf("r_%d", 104-offset-i) {
				t.Fatalf("page %d index %d: %v", offset, i, revision)
			}
		}
	}
	// Restore a historical snapshot through the public handler; then no-op must
	// compare against that newly created revision, without creating another one.
	r := httptest.NewRequest("POST", "/revisions/r_0", nil)
	r.SetPathValue("id", "r_0")
	w := httptest.NewRecorder()
	HeadlineMemoryRevision(cfg).ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	before, err := listCoverRevisions(t.Context(), db, "local", 0)
	if err != nil || len(before) == 0 || before[0].Reason != "原有经验" {
		// Restoring the identical empty snapshot is a no-op after preserving the
		// initial fingerprint; it must not add a second "回退经验" revision.
		t.Fatalf("restore empty snapshot %v %v", before, err)
	}
	var countBefore, countAfter int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryRevision"`).Scan(&countBefore); err != nil {
		t.Fatal(err)
	}
	if err := mutateCoverExperience(t.Context(), db, "local", "no change", func(*sql.Tx) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryRevision"`).Scan(&countAfter); err != nil || countBefore != countAfter {
		t.Fatalf("post-restore no-op %d -> %d: %v", countBefore, countAfter, err)
	}
}
