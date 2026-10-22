package catalog

import (
	"context"
	"database/sql"

	"beike.local/cloud/src/backend/internal/platform/database"
)

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
