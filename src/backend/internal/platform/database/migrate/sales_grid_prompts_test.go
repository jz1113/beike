package migrate

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestGridPromptMigrationDeletesOnlyRetiredOverridesWithBackup(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "..", "..", "..", ".."))
	path := filepath.Join(t.TempDir(), "sales-prompts.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	items := mustMigrations()
	boundary := -1
	for i, item := range items {
		if item.version == "20261101_02_sales_grid_prompts" {
			boundary = i
			break
		}
	}
	if boundary < 0 {
		t.Fatal("grid prompt migration missing")
	}
	if err := applyPending(context.Background(), db, items[:boundary]); err != nil {
		t.Fatal(err)
	}
	retired := []string{"persona-face", "persona-side", "persona-front", "scene-left", "scene-right", "scene-reverse"}
	preserved := []string{"summary", "script-analysis", "script-normalize", "plan-adapt", "persona-grid", "scene-grid", "persona-face-extra"}
	for _, workspace := range []string{"local", "other"} {
		for _, id := range append(append([]string{}, retired...), preserved...) {
			if _, err := db.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES (?,?,?,?)`, workspace, id, workspace+":"+id, "original-time"); err != nil {
				t.Fatal(err)
			}
		}
	}
	db.Close()
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	// Re-running applies no deletion to the current templates or other user records.
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	db, err = sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "SalesPromptOverride"`).Scan(&count); err != nil || count != 2*len(preserved) {
		t.Fatal("unexpected remaining prompt count", count, err)
	}
	for _, workspace := range []string{"local", "other"} {
		for _, id := range preserved {
			var prompt, updatedAt string
			if err := db.QueryRow(`SELECT "prompt","updatedAt" FROM "SalesPromptOverride" WHERE "workspaceId"=? AND "promptId"=?`, workspace, id).Scan(&prompt, &updatedAt); err != nil || prompt != workspace+":"+id || updatedAt != "original-time" {
				t.Fatal("unrelated or current prompt changed", workspace, id, err)
			}
		}
	}
	backups, _ := filepath.Glob(filepath.Join(filepath.Dir(path), "database-backups", "before-20261101_02_sales_grid_prompts-*.db"))
	if len(backups) != 1 {
		t.Fatal("expected one pre-upgrade backup", backups)
	}
	backup, err := sql.Open("sqlite", backups[0])
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	if err := backup.QueryRow(`SELECT COUNT(*) FROM "SalesPromptOverride"`).Scan(&count); err != nil || count != 2*(len(retired)+len(preserved)) {
		t.Fatal("original overrides missing from pre-upgrade backup", count, err)
	}
}
