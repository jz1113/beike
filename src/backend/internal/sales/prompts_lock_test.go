package sales

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"modernc.org/sqlite"
)

// An existing read snapshot prevents a new connection changing DELETE to WAL.
// Unlike normal write contention, this can return BUSY before busy_timeout runs.
func holdPromptJournalReadLock(t *testing.T, cfg config.Config) func() {
	t.Helper()
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err = db.Exec(`PRAGMA journal_mode=DELETE`); err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })
	var count int
	if err = tx.QueryRow(`SELECT count(*) FROM "SalesPromptOverride"`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	// Verify this is the real connection-initialization BUSY path, not a timer race.
	d, _ := findPromptDefinition("summary")
	text := "locked precondition"
	_, err = trySaveSalesPrompt(t.Context(), cfg, "local", d, &text, d.resolve(nil).Version)
	var sqliteErr *sqlite.Error
	if !errors.As(err, &sqliteErr) || sqliteErr.Code()&0xff != 5 {
		t.Fatalf("expected initialization lock, got %v", err)
	}
	return func() {
		if err := tx.Rollback(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPromptSaveWaitsForJournalInitializationLock(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	release := holdPromptJournalReadLock(t, cfg)
	d, _ := findPromptDefinition("summary")
	texts := []string{"锁释放后保存的提示词", "另一个编辑者的提示词"}
	done := make(chan error, 2)
	for _, text := range texts {
		go func() {
			_, err := saveSalesPrompt(t.Context(), cfg, "local", d, &text, d.resolve(nil).Version)
			done <- err
		}()
	}
	select {
	case err := <-done:
		t.Fatalf("save failed before temporary lock was released: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	release()
	successes, conflicts := 0, 0
	for range texts {
		select {
		case err := <-done:
			if err == nil {
				successes++
			} else if errors.Is(err, errPromptConflict) {
				conflicts++
			} else {
				t.Fatal(err)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("save did not resume after lock release")
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("competing editors: success=%d conflict=%d", successes, conflicts)
	}
	saved, err := loadSalesPrompt(t.Context(), cfg, "local", "summary")
	if err != nil || (saved.Prompt != texts[0] && saved.Prompt != texts[1]) {
		t.Fatalf("prompt not persisted: %+v %v", saved, err)
	}
}

func TestPromptSaveCancelsJournalLockRetry(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	release := holdPromptJournalReadLock(t, cfg)
	defer release()
	d, _ := findPromptDefinition("summary")
	text := "不应保存"
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := saveSalesPrompt(ctx, cfg, "local", d, &text, d.resolve(nil).Version); done <- err }()
	select {
	case err := <-done:
		t.Fatalf("save did not wait on transient lock: %v", err)
	case <-time.After(75 * time.Millisecond):
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancel returned %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancelled save kept retrying")
	}
}

func TestPromptSaveDoesNotRetrySchemaErrorsAsConflicts(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`DROP TABLE "SalesPromptOverride"`); err != nil {
		t.Fatal(err)
	}
	d, _ := findPromptDefinition("summary")
	text := "不能保存"
	_, err = saveSalesPrompt(t.Context(), cfg, "local", d, &text, d.resolve(nil).Version)
	var sqliteErr *sqlite.Error
	if !errors.As(err, &sqliteErr) || sqliteErr.Code() != 1 || errors.Is(err, errPromptConflict) {
		t.Fatalf("schema failure disguised: %v", err)
	}
}

func TestPromptSaveRechecksVersionAfterWriterLock(t *testing.T) {
	cfg := setupSalesTestConfig(t)
	db, err := sql.Open("sqlite", cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	first := "另一个页面已保存的版本"
	if _, err := tx.Exec(`INSERT INTO "SalesPromptOverride" ("workspaceId","promptId","prompt","updatedAt") VALUES ('local','summary',?,'now')`, first); err != nil {
		t.Fatal(err)
	}
	d, _ := findPromptDefinition("summary")
	second := "不能覆盖先保存的版本"
	_, err = trySaveSalesPrompt(t.Context(), cfg, "local", d, &second, d.resolve(nil).Version)
	var sqliteErr *sqlite.Error
	if !errors.As(err, &sqliteErr) || sqliteErr.Code()&0xff != 5 {
		t.Fatalf("expected writer lock, got %v", err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := saveSalesPrompt(t.Context(), cfg, "local", d, &second, d.resolve(nil).Version)
		done <- err
	}()
	select {
	case err := <-done:
		t.Fatalf("did not wait for writer: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, errPromptConflict) {
			t.Fatalf("version not rechecked: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("write lock retry did not finish")
	}
	saved, err := loadSalesPrompt(t.Context(), cfg, "local", "summary")
	if err != nil || saved.Prompt != first {
		t.Fatalf("first writer overwritten: %+v %v", saved, err)
	}
}
