package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

var ErrSkillConflict = errors.New("skill version conflict")
var ErrSkillMissing = errors.New("skill missing")

func ListSkillDocuments(ctx context.Context, db *sql.DB, workspace string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `SELECT "contentJson", "version" FROM "SkillDocument" WHERE "workspaceId" = ? ORDER BY "updatedAt" DESC, "id"`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var body, version string
		if err := rows.Scan(&body, &version); err != nil {
			return nil, err
		}
		var content map[string]any
		if err := json.Unmarshal([]byte(body), &content); err != nil {
			return nil, err
		}
		content["libraryVersion"] = version
		items = append(items, content)
	}
	return items, rows.Err()
}

// expected is required for updates; POST only creates. A stale editor cannot
// overwrite a newer server document. Revision and document are one transaction.
func SaveSkillDocument(ctx context.Context, db *sql.DB, workspace string, content map[string]any, expected string, create bool) (map[string]any, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	id, _ := content["id"].(string)
	delete(content, "libraryVersion")
	version := SkillVersion(content)
	body, err := json.Marshal(content)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if create {
		result, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "SkillDocument" ("workspaceId","id","contentJson","version","updatedAt") VALUES (?,?,?,?,?)`, workspace, id, string(body), version, now)
		if err != nil {
			return nil, err
		}
		if n, _ := result.RowsAffected(); n != 1 {
			return nil, ErrSkillConflict
		}
	} else {
		if expected == "" {
			return nil, ErrSkillConflict
		}
		result, err := tx.ExecContext(ctx, `UPDATE "SkillDocument" SET "contentJson" = ?, "version" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "id" = ? AND "version" = ?`, string(body), version, now, workspace, id, expected)
		if err != nil {
			return nil, err
		}
		if n, _ := result.RowsAffected(); n != 1 {
			return nil, ErrSkillConflict
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "SkillRevision" ("workspaceId","kind","skillId","version","contentJson","createdAt") VALUES (?,'assistant',?,?,?,?)`, workspace, id, version, string(body), now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	content["libraryVersion"] = version
	return content, nil
}

func DeleteSkillDocument(ctx context.Context, db *sql.DB, workspace, id, expected string) error {
	if expected == "" {
		return ErrSkillConflict
	}
	result, err := db.ExecContext(ctx, `DELETE FROM "SkillDocument" WHERE "workspaceId" = ? AND "id" = ? AND "version" = ?`, workspace, id, expected)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return ErrSkillConflict
	}
	return nil
}
