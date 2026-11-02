package database

import (
	"database/sql"
	"errors"
)

// OpenRequired rejects an absent configured path. The caller retains ownership
// of closing the connection; migrations remain an explicit startup operation.
func OpenRequired(path string) (*sql.DB, error) {
	if path == "" {
		return nil, errors.New("missing database")
	}
	return OpenWrite(path)
}

func OpenWrite(path string) (*sql.DB, error) {
	return sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
}
