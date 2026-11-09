package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
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

func SkillFavorites(ctx context.Context, db *sql.DB, workspace string) (map[string]bool, error) {
	rows, err := db.QueryContext(ctx, `SELECT "kind", "skillId", "isFavorite" FROM "SkillPreference" WHERE "workspaceId" = ?`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := map[string]bool{}
	for rows.Next() {
		var kind, id string
		var favorite int
		if err := rows.Scan(&kind, &id, &favorite); err != nil {
			return nil, err
		}
		values[kind+":"+id] = favorite != 0
	}
	return values, rows.Err()
}

func SetSkillFavorite(ctx context.Context, db *sql.DB, workspace, kind, id string, favorite bool) error {
	var count int
	var err error
	if kind == "assistant" {
		err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "SkillDocument" WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(&count)
	} else if kind == "workshop" {
		err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "StyleRecipe" WHERE "workspaceId" IN (?,?) AND "id" = ? AND "id" NOT IN (SELECT "assetId" FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "eventType" = 'recipe_hidden')`, workspace, database.OfficialWorkspace, id, workspace).Scan(&count)
	} else {
		return ErrSkillMissing
	}
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrSkillMissing
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "SkillPreference" ("workspaceId","kind","skillId","isFavorite") VALUES (?,?,?,?) ON CONFLICT ("workspaceId","kind","skillId") DO UPDATE SET "isFavorite" = excluded."isFavorite"`, workspace, kind, id, boolInt(favorite))
	return err
}

// Content versions are immutable. Workshop rows retain their existing IDs and
// ownership; the library materializes snapshots when those rows are read.
func SkillVersion(content map[string]any) string {
	copy := make(map[string]any, len(content))
	for key, value := range content {
		if key != "libraryVersion" && key != "isFavorite" {
			copy[key] = value
		}
	}
	body, _ := json.Marshal(copy)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func RememberSkillRevision(ctx context.Context, db *sql.DB, workspace, kind, id string, content map[string]any) (string, error) {
	version := SkillVersion(content)
	body, err := json.Marshal(content)
	if err != nil {
		return "", err
	}
	_, err = db.ExecContext(ctx, `INSERT OR IGNORE INTO "SkillRevision"
		("workspaceId","kind","skillId","version","contentJson","createdAt") VALUES (?,?,?,?,?,?)`,
		workspace, kind, id, version, string(body), time.Now().UTC().Format(time.RFC3339Nano))
	return version, err
}

func ReadSkillRevision(ctx context.Context, db *sql.DB, workspace, kind, id, version string) (map[string]any, error) {
	var body string
	err := db.QueryRowContext(ctx, `SELECT "contentJson" FROM "SkillRevision"
		WHERE "workspaceId" = ? AND "kind" = ? AND "skillId" = ? AND "version" = ?`, workspace, kind, id, version).Scan(&body)
	if err != nil {
		return nil, err
	}
	var content map[string]any
	if err := json.Unmarshal([]byte(body), &content); err != nil {
		return nil, err
	}
	content["libraryVersion"] = version
	return content, nil
}
