package migrate

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"
)

type execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func sha256Hex(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func ident(name string) string {
	if !regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`).MatchString(name) {
		panic("invalid identifier " + name)
	}
	return `"` + name + `"`
}

func splitSQL(script string) []string {
	parts := strings.Split(script, ";")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func replaceFirst(text, old, next string) string {
	if i := strings.Index(text, old); i >= 0 {
		return text[:i] + next + text[i+len(old):]
	}
	return text
}

func exec(ctx context.Context, db execer, query string, args ...any) error {
	_, err := db.ExecContext(ctx, query, args...)
	return err
}

func queryStrings(ctx context.Context, db execer, query string, args ...any) ([]string, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		out = append(out, value)
	}
	return out, rows.Err()
}

func tableExists(ctx context.Context, db execer, name string) (bool, error) {
	var found string
	err := db.QueryRowContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func columnNames(ctx context.Context, db execer, table string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `PRAGMA table_info(`+ident(table)+`)`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var cid, notNull, pk int
		var name string
		var typ, dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func hasColumn(ctx context.Context, db execer, table, column string) (bool, error) {
	names, err := columnNames(ctx, db, table)
	if err != nil {
		return false, err
	}
	for _, name := range names {
		if name == column {
			return true, nil
		}
	}
	return false, nil
}

func countRows(ctx context.Context, db execer, table string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+ident(table)).Scan(&n)
	return n, err
}

var alterColumn = regexp.MustCompile(`^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"`)

func execScript(ctx context.Context, db execer, script string, skipExistingAlter bool) error {
	for _, statement := range splitSQL(script) {
		if skipExistingAlter {
			if match := alterColumn.FindStringSubmatch(statement); match != nil {
				exists, err := hasColumn(ctx, db, match[1], match[2])
				if err != nil {
					return err
				}
				if exists {
					continue
				}
			}
		}
		if err := exec(ctx, db, statement); err != nil {
			return err
		}
	}
	return nil
}

func isoNow() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
