package database

import "testing"

func TestOpenRequiredRejectsAbsentDatabase(t *testing.T) {
	db, err := OpenRequired("")
	if err == nil || db != nil || err.Error() != "missing database" {
		t.Fatalf("empty database: %v %v", db, err)
	}
}
