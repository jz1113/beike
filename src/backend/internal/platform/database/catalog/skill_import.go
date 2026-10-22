package catalog

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// Import keys survive deletion, so an old browser vault never resurrects a
// deleted document. Conflicting IDs get a stable separate copy, never a merge.
func ImportSkillDocuments(ctx context.Context, db *sql.DB, workspace string, items []map[string]any) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, item := range items {
		delete(item, "libraryVersion")
		original, _ := item["id"].(string)
		hash := SkillVersion(item)
		key := original + ":" + hash
		var mapped string
		err := tx.QueryRowContext(ctx, `SELECT "skillId" FROM "SkillImport" WHERE "workspaceId" = ? AND "sourceKey" = ?`, workspace, key).Scan(&mapped)
		if err == nil {
			continue
		}
		if err != sql.ErrNoRows {
			return err
		}
		id := original
		var existing string
		err = tx.QueryRowContext(ctx, `SELECT "version" FROM "SkillDocument" WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(&existing)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == nil && existing != hash {
			id = "import_" + hash
			item["id"] = id
		}
		version := SkillVersion(item)
		body, err := json.Marshal(item)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "SkillDocument" ("workspaceId","id","contentJson","version","updatedAt") VALUES (?,?,?,?,?)`, workspace, id, string(body), version, now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO "SkillRevision" ("workspaceId","kind","skillId","version","contentJson","createdAt") VALUES (?,'assistant',?,?,?,?)`, workspace, id, version, string(body), now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO "SkillImport" ("workspaceId","sourceKey","skillId") VALUES (?,?,?)`, workspace, key, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
