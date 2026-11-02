package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

var errPresetConflict = errors.New("预设编号冲突或不属于当前工作区")

// Persist the preset before replacing the default so a failed write leaves the
// existing configuration intact. Both changes commit together.
func saveProductionPreset(ctx context.Context, db *sql.DB, workspace string, item storedPreset) (storedPreset, error) {
	raw, err := json.Marshal(item.Config)
	if err != nil {
		return storedPreset{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return storedPreset{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO "SalesProductionPreset" ("id","workspaceId","name","category","configJson","isDefault","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?) ON CONFLICT("id") DO UPDATE SET "name"=excluded."name","category"=excluded."category","configJson"=excluded."configJson","isDefault"=excluded."isDefault","updatedAt"=excluded."updatedAt" WHERE "SalesProductionPreset"."workspaceId"=excluded."workspaceId" AND "SalesProductionPreset"."category"<>?`,
		item.ID, workspace, item.Name, item.Category, string(raw), item.IsDefault, item.CreatedAt, item.UpdatedAt, customBgmPresetCategory)
	if err != nil {
		return storedPreset{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return storedPreset{}, err
	}
	if count == 0 {
		return storedPreset{}, errPresetConflict
	}
	if item.IsDefault {
		if _, err := tx.ExecContext(ctx, `UPDATE "SalesProductionPreset" SET "isDefault"=0 WHERE "workspaceId"=? AND "category"=? AND "id"<>?`, workspace, item.Category, item.ID); err != nil {
			return storedPreset{}, err
		}
	}
	if err := tx.QueryRowContext(ctx, `SELECT "createdAt" FROM "SalesProductionPreset" WHERE "workspaceId"=? AND "id"=?`, workspace, item.ID).Scan(&item.CreatedAt); err != nil {
		return storedPreset{}, err
	}
	if err := tx.Commit(); err != nil {
		return storedPreset{}, err
	}
	return item, nil
}
