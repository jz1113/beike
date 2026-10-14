package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

func DeleteLibraryAssets(ctx context.Context, db *sql.DB, workspace, assetType string, ids []string, reviewRoot string) (int, error) {
	table, column, ok := libraryDeleteTarget(assetType)
	if !ok {
		return 0, errUnsupportedAsset
	}
	if assetType == "full_prompt" {
		return deleteFullPromptAssets(ctx, db, workspace, ids)
	}
	urls, err := libraryMediaURLs(ctx, db, workspace, table, column, ids)
	if err != nil {
		return 0, err
	}
	if len(urls) > 0 {
		if err := database.WriteMediaReviews(reviewRoot, workspace, urls, ids); err != nil {
			return 0, err
		}
	}
	return deleteCurrentAssets(ctx, db, workspace, table, ids)
}

func libraryDeleteTarget(assetType string) (string, string, bool) {
	switch assetType {
	case "scene":
		return "SceneAsset", "coverUrl,sourceImages", true
	case "outfit", "action":
		return assetTableName(assetType), "coverUrl", true
	case "persona":
		return "PersonaAsset", "avatarUrl", true
	case "full_prompt":
		return "FullPromptAsset", "", true
	default:
		return "", "", false
	}
}

func assetTableName(assetType string) string {
	switch assetType {
	case "outfit":
		return "OutfitAsset"
	default:
		return "ActionAsset"
	}
}

func libraryMediaURLs(ctx context.Context, db *sql.DB, workspace, table, columns string, ids []string) ([]string, error) {
	if !libraryTable(table) {
		return nil, errUnsupportedAsset
	}
	query := `SELECT ` + quotedColumns(columns) + ` FROM "` + table + `" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + database.QuestionMarks(len(ids)) + `)`
	args := []any{workspace, database.OfficialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	urls := []string{}
	fields := strings.Split(columns, ",")
	for rows.Next() {
		values := make([]sql.NullString, len(fields))
		dest := make([]any, len(fields))
		for i := range values {
			dest[i] = &values[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		for i, value := range values {
			if !value.Valid || value.String == "" {
				continue
			}
			if fields[i] == "sourceImages" {
				urls = append(urls, jsonStringItems(value.String)...)
				continue
			}
			urls = append(urls, value.String)
		}
	}
	return urls, rows.Err()
}

func deleteCurrentAssets(ctx context.Context, db *sql.DB, workspace, table string, ids []string) (int, error) {
	if !libraryTable(table) {
		return 0, errUnsupportedAsset
	}
	result, err := db.ExecContext(ctx, `
		DELETE FROM "`+table+`" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...)
	if err != nil {
		return 0, err
	}
	count, _ := result.RowsAffected()
	return int(count), nil
}

func deleteFullPromptAssets(ctx context.Context, db *sql.DB, workspace string, ids []string) (int, error) {
	unique := database.UniqueIDs(ids)
	var count int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM "FullPromptAsset" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(unique))+`)`,
		append([]any{workspace}, database.StringsToAny(unique)...)...).Scan(&count); err != nil {
		return 0, err
	}
	if count != len(unique) {
		return 0, errMotherMissing
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? AND "motherAssetId" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...); err != nil {
		return 0, err
	}
	result, err := tx.ExecContext(ctx, `
		DELETE FROM "FullPromptAsset" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	committed = true
	deleted, _ := result.RowsAffected()
	return int(deleted), nil
}

func libraryTable(table string) bool {
	switch table {
	case "SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset", "FullPromptAsset":
		return true
	default:
		return false
	}
}

func quotedColumns(columns string) string {
	parts := strings.Split(columns, ",")
	for i, part := range parts {
		parts[i] = `"` + part + `"`
	}
	return strings.Join(parts, ", ")
}

func jsonStringItems(raw string) []string {
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	items := []string{}
	for _, item := range parsed {
		if text, ok := item.(string); ok && text != "" {
			items = append(items, text)
		}
	}
	return items
}

var (
	errUnsupportedAsset = database.ErrText("不支持的资产类型")
	errMotherMissing    = database.ErrText("所选母组不存在或不可删除")
)
