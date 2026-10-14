package database

import (
	"context"
	"database/sql"
	"time"
)

const OfficialWorkspace = "official"

type RecordCounts struct {
	ImageTaskCount       int
	ProductCount         int
	SceneCount           int
	OutfitCount          int
	ActionCount          int
	PersonaCount         int
	StyleRecipeCount     int
	AssistantThreadCount int
	PromptRecordCount    int
}

func CountRecords(path, workspace string) (RecordCounts, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return RecordCounts{}, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var counts RecordCounts
	counts.ImageTaskCount = countRows(ctx, db, "ImageTask", workspace, false)
	counts.ProductCount = countRows(ctx, db, "Product", workspace, false)
	counts.SceneCount = countRows(ctx, db, "SceneAsset", workspace, true)
	counts.OutfitCount = countRows(ctx, db, "OutfitAsset", workspace, true)
	counts.ActionCount = countRows(ctx, db, "ActionAsset", workspace, true)
	counts.PersonaCount = countRows(ctx, db, "PersonaAsset", workspace, true)
	counts.StyleRecipeCount = countRows(ctx, db, "StyleRecipe", workspace, true)
	counts.AssistantThreadCount = countRows(ctx, db, "AssistantThread", workspace, false)
	counts.PromptRecordCount = countRows(ctx, db, "PromptRecord", workspace, false)
	return counts, nil
}

func countRows(ctx context.Context, db *sql.DB, table, workspace string, shared bool) int {
	query := `SELECT COUNT(*) FROM "` + table + `" WHERE "workspaceId" = ?`
	args := []any{workspace}
	if shared {
		query = `SELECT COUNT(*) FROM "` + table + `" WHERE "workspaceId" IN (?, ?)`
		args = []any{workspace, OfficialWorkspace}
	}
	var count int
	if err := db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0
	}
	return count
}
