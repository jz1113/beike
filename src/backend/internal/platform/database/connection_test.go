package database

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenRequiredRejectsAbsentDatabase(t *testing.T) {
	db, err := OpenRequired("")
	if err == nil || db != nil || err.Error() != "missing database" {
		t.Fatalf("empty database: %v %v", db, err)
	}
}

func TestOpenWriteEscapesSpecialPathCharactersAndKeepsPragmas(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "dir#1?test", "azhuo.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var foreignKeys int
	if err := db.QueryRow(`PRAGMA foreign_keys`).Scan(&foreignKeys); err != nil {
		t.Fatal(err)
	}
	if foreignKeys != 1 {
		t.Fatalf("expected foreign_keys pragma=1 even with ?/# in path, got %d", foreignKeys)
	}
}
