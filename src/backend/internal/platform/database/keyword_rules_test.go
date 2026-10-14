package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

func TestPublishKeywordRulesRejectsStaleVersion(t *testing.T) {
	db := openRuleFixture(t)
	ctx := context.Background()
	first, err := PublishKeywordRules(ctx, db, "local", 0, []RuleEntry{{Section: "其他说明", Text: "保留可核验的结论"}}, "首次发布")
	if err != nil || first.Version != 1 {
		t.Fatalf("publish: %v %#v", err, first)
	}
	if _, err := PublishKeywordRules(ctx, db, "local", 0, []RuleEntry{{Section: "其他说明", Text: "另一条规则"}}, "重复发布"); err != ErrRuleConflict {
		t.Fatalf("stale publish err = %v", err)
	}
	current, history, err := ListKeywordRules(ctx, db, "local")
	if err != nil || current.Version != 1 || len(history) != 2 || history[1].Version != 0 {
		t.Fatalf("list current=%#v history=%#v err=%v", current, history, err)
	}
}

func openRuleFixture(t *testing.T) *sql.DB {
	t.Helper()
	db, err := OpenWrite(filepath.Join(t.TempDir(), "rules.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(`CREATE TABLE "KeywordReviewRuleRevision" (
		"id" TEXT NOT NULL PRIMARY KEY,
		"workspaceId" TEXT NOT NULL,
		"version" INTEGER NOT NULL,
		"entriesJson" TEXT NOT NULL DEFAULT '[]',
		"note" TEXT NOT NULL DEFAULT '',
		"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE UNIQUE INDEX "KeywordReviewRuleRevision_workspaceId_version_key" ON "KeywordReviewRuleRevision"("workspaceId", "version")`); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestOpenWriteUsesWAL(t *testing.T) {
	db, err := OpenWrite(filepath.Join(t.TempDir(), "wal.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(mode, "wal") {
		t.Fatalf("journal_mode %s", mode)
	}
}
