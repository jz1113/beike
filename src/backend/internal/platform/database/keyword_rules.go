package database

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type RuleEntry struct {
	Section string `json:"section"`
	Text    string `json:"text"`
	Mode    string `json:"mode,omitempty"`
}

type RuleRevision struct {
	Version   int         `json:"version"`
	Entries   []RuleEntry `json:"entries"`
	Note      string      `json:"note"`
	CreatedAt any         `json:"createdAt"`
}

var ErrRuleConflict = errors.New("规则已被其他人更新，请刷新后再保存")

func InitialRuleRevision() RuleRevision {
	return RuleRevision{Version: 0, Entries: []RuleEntry{}, Note: "初始规则", CreatedAt: nil}
}

func OpenWrite(path string) (*sql.DB, error) {
	return sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
}

func ListKeywordRules(ctx context.Context, db *sql.DB, workspace string) (RuleRevision, []RuleRevision, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "version", "entriesJson", "note", "createdAt"
		FROM "KeywordReviewRuleRevision"
		WHERE "workspaceId" = ?
		ORDER BY "version" DESC
		LIMIT 30`, workspace)
	if err != nil {
		return InitialRuleRevision(), []RuleRevision{InitialRuleRevision()}, err
	}
	defer rows.Close()
	history := []RuleRevision{}
	for rows.Next() {
		revision, err := scanRevision(rows)
		if err != nil {
			return RuleRevision{}, nil, err
		}
		history = append(history, revision)
	}
	if err := rows.Err(); err != nil {
		return RuleRevision{}, nil, err
	}
	current := InitialRuleRevision()
	if len(history) > 0 {
		current = history[0]
	}
	return current, append(history, InitialRuleRevision()), nil
}

func PublishKeywordRules(ctx context.Context, db *sql.DB, workspace string, baseVersion int, entries []RuleEntry, note string) (RuleRevision, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return RuleRevision{}, err
	}
	defer tx.Rollback()
	var latest sql.NullInt64
	err = tx.QueryRowContext(ctx, `
		SELECT "version" FROM "KeywordReviewRuleRevision"
		WHERE "workspaceId" = ? ORDER BY "version" DESC LIMIT 1`, workspace).Scan(&latest)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return RuleRevision{}, err
	}
	current := 0
	if latest.Valid {
		current = int(latest.Int64)
	}
	if current != baseVersion {
		return RuleRevision{}, ErrRuleConflict
	}
	body, err := json.Marshal(entries)
	if err != nil {
		return RuleRevision{}, err
	}
	created := time.Now().UTC()
	id, err := NewID()
	if err != nil {
		return RuleRevision{}, err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "KeywordReviewRuleRevision" ("id", "workspaceId", "version", "entriesJson", "note", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?)`,
		id, workspace, current+1, string(body), note, created.Format("2006-01-02T15:04:05.000Z"))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return RuleRevision{}, ErrRuleConflict
		}
		return RuleRevision{}, err
	}
	if err := tx.Commit(); err != nil {
		return RuleRevision{}, err
	}
	return RuleRevision{Version: current + 1, Entries: entries, Note: note, CreatedAt: created.Format("2006-01-02T15:04:05.000Z")}, nil
}

type Scanner interface {
	Scan(dest ...any) error
}

func scanRevision(row Scanner) (RuleRevision, error) {
	var version int
	var entriesJSON, note, created string
	if err := row.Scan(&version, &entriesJSON, &note, &created); err != nil {
		return RuleRevision{}, err
	}
	var entries []RuleEntry
	if err := json.Unmarshal([]byte(entriesJSON), &entries); err != nil {
		return RuleRevision{}, fmt.Errorf("审核规则内容无法读取")
	}
	if entries == nil {
		entries = []RuleEntry{}
	}
	return RuleRevision{Version: version, Entries: entries, Note: note, CreatedAt: FormatSQLiteTime(created)}, nil
}

func FormatSQLiteTime(raw string) string {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05", "2006-01-02T15:04:05.000Z"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC().Format("2006-01-02T15:04:05.000Z")
		}
	}
	return raw
}

func NewID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}
