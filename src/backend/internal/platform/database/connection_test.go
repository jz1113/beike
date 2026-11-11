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
	dbPath := filepath.Join(t.TempDir(), "dir%23#1?test", "azhuo.db")
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
	if _, err := os.Stat(dbPath); err != nil {
		t.Fatalf("requested file was not created: %v", err)
	}
}

func TestDatabaseMaintenanceUsesTheSameSpecialPath(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "data%23#?.db")
	db, err := OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE "_BeikeMigration" (version TEXT); INSERT INTO "_BeikeMigration" VALUES ('test');
		CREATE TABLE "ImageTask" (workspaceId TEXT); INSERT INTO "ImageTask" VALUES ('owner')`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	if err := Check(dbPath); err != nil {
		t.Fatalf("health read opened a different database: %v", err)
	}
	if err := Checkpoint(dbPath); err != nil {
		t.Fatal(err)
	}
	counts, err := CountRecords(dbPath, "owner")
	if err != nil || counts.ImageTaskCount != 1 {
		t.Fatalf("record count opened a different database: %+v %v", counts, err)
	}
}
