package migrate

import (
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"database/sql"
	"encoding/json"
)

// Recover only built-in folders justified by repeated primary-subject evidence.
func applyReferenceFolderRepair(ctx context.Context, db execer) error {
	rows, err := db.QueryContext(ctx, `SELECT "id","workspaceId","shotPromptsJson","productCategoryIds" FROM "FullPromptAsset" WHERE "productSubcategory" IN ('phone','prompt_subcategory:digital_3c:phone') AND "shotPromptsJson" IS NOT NULL`)
	if err != nil {
		return err
	}
	type record struct{ id, workspace, shots, categories string }
	records := []record{}
	for rows.Next() {
		var r record
		if err := rows.Scan(&r.id, &r.workspace, &r.shots, &r.categories); err != nil {
			rows.Close()
			return err
		}
		records = append(records, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, r := range records {
		var categories []string
		var shots []map[string]any
		if json.Unmarshal([]byte(r.categories), &categories) != nil || json.Unmarshal([]byte(r.shots), &shots) != nil || len(shots) != 4 {
			continue
		}
		digital := false
		for _, id := range categories {
			digital = digital || id == "digital_3c"
		}
		if !digital {
			continue
		}
		kind := dblibrary.ReferenceSubjectSubcategory(r.shots)
		name := map[string]string{"case": "手机壳", "earphone": "耳机", "tablet": "平板"}[kind]
		if name == "" {
			continue
		}
		var owner string
		err := db.QueryRowContext(ctx, `SELECT "workspaceId" FROM "AssetProductCategory" WHERE "id"='digital_3c' AND "isArchived"=0 AND "workspaceId" IN (?, 'official')`, r.workspace).Scan(&owner)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return err
		}
		folder := "prompt_subcategory:digital_3c:" + kind
		if err := exec(ctx, db, `INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","parentId","workspaceId") VALUES (?,?,'digital_3c',?)`, folder, name, owner); err != nil {
			return err
		}
		result, err := db.ExecContext(ctx, `UPDATE "AssetProductCategory" SET "isArchived"=0 WHERE "id"=? AND "parentId"='digital_3c' AND "workspaceId" IN (?, 'official')`, folder, r.workspace)
		if err != nil {
			return err
		}
		if count, _ := result.RowsAffected(); count != 1 {
			continue
		}
		if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productSubcategory"=? WHERE "id"=? AND "workspaceId"=?`, kind, r.id, r.workspace); err != nil {
			return err
		}
	}
	return nil
}
