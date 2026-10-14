package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

func releaseCategoryReferences(ctx context.Context, tx *sql.Tx, workspace string, removed []string) (int, error) {
	blocked := map[string]struct{}{}
	for _, id := range removed {
		blocked[id] = struct{}{}
	}
	released, err := releasePromptGroups(ctx, tx, workspace, blocked)
	if err != nil {
		return 0, err
	}
	for _, table := range []string{"PersonaAsset", "SceneAsset", "OutfitAsset", "ActionAsset"} {
		if err := releaseAssetCategories(ctx, tx, table, workspace, blocked); err != nil {
			return 0, err
		}
	}
	return released, nil
}

func releasePromptGroups(ctx context.Context, tx *sql.Tx, workspace string, blocked map[string]struct{}) (int, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "productCategoryIds" FROM "FullPromptAsset" WHERE "workspaceId" = ?`, workspace)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	released := 0
	type pending struct{ id, categories string }
	updates := []pending{}
	for rows.Next() {
		var id, categories string
		if err := rows.Scan(&id, &categories); err != nil {
			return 0, err
		}
		if !categoryIntersects(categories, blocked) {
			continue
		}
		released++
		updates = append(updates, pending{id, categoriesWithout(categories, blocked)})
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, item := range updates {
		if _, err := tx.ExecContext(ctx, `
			UPDATE "FullPromptAsset" SET "productCategoryIds" = ?, "productSubcategory" = NULL
			WHERE "workspaceId" = ? AND "id" = ?`, item.categories, workspace, item.id); err != nil {
			return 0, err
		}
	}
	return released, nil
}

func releaseAssetCategories(ctx context.Context, tx *sql.Tx, table, workspace string, blocked map[string]struct{}) error {
	if !releaseTable(table) {
		return nil
	}
	rows, err := tx.QueryContext(ctx, `SELECT "id", "productCategoryIds" FROM "`+table+`" WHERE "workspaceId" = ?`, workspace)
	if err != nil {
		return err
	}
	defer rows.Close()
	type pending struct{ id, categories string }
	updates := []pending{}
	for rows.Next() {
		var id, categories string
		if err := rows.Scan(&id, &categories); err != nil {
			return err
		}
		if categoryIntersects(categories, blocked) {
			updates = append(updates, pending{id, categoriesWithout(categories, blocked)})
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, item := range updates {
		if _, err := tx.ExecContext(ctx, `
			UPDATE "`+table+`" SET "productCategoryIds" = ? WHERE "workspaceId" = ? AND "id" = ?`,
			item.categories, workspace, item.id); err != nil {
			return err
		}
	}
	return nil
}

func clearSubcategory(ctx context.Context, tx *sql.Tx, workspace, parentID string, values []string) (int, error) {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(values)), ",")
	args := []any{workspace}
	for _, value := range values {
		args = append(args, value)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "albumId", "productCategoryIds" FROM "FullPromptAsset"
		WHERE "workspaceId" = ? AND "productSubcategory" IN (`+placeholders+`)`, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	type candidate struct {
		id, albumID, categories string
	}
	found := []candidate{}
	albumIDs := []string{}
	for rows.Next() {
		var item candidate
		var album sql.NullString
		if err := rows.Scan(&item.id, &album, &item.categories); err != nil {
			return 0, err
		}
		if album.Valid {
			item.albumID = album.String
			albumIDs = append(albumIDs, album.String)
		}
		found = append(found, item)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	albumCategories, err := albumCategoryMap(ctx, tx, workspace, albumIDs)
	if err != nil {
		return 0, err
	}
	affected := []string{}
	for _, item := range found {
		if categoryIntersects(item.categories, map[string]struct{}{parentID: {}}) || (strings.TrimSpace(item.categories) == "" && item.albumID != "" && albumCategories[item.albumID] == parentID) {
			affected = append(affected, item.id)
		}
	}
	if len(affected) == 0 {
		return 0, nil
	}
	marks := strings.TrimRight(strings.Repeat("?,", len(affected)), ",")
	updateArgs := []any{workspace}
	for _, id := range affected {
		updateArgs = append(updateArgs, id)
	}
	result, err := tx.ExecContext(ctx, `
		UPDATE "FullPromptAsset" SET "productSubcategory" = NULL
		WHERE "workspaceId" = ? AND "id" IN (`+marks+`)`, updateArgs...)
	if err != nil {
		return 0, err
	}
	count, _ := result.RowsAffected()
	return int(count), nil
}

func albumCategoryMap(ctx context.Context, tx *sql.Tx, workspace string, ids []string) (map[string]string, error) {
	result := map[string]string{}
	unique := uniqueIDs(ids)
	if len(unique) == 0 {
		return result, nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(unique)), ",")
	args := []any{workspace, officialWorkspace}
	for _, id := range unique {
		args = append(args, id)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "productCategoryId" FROM "PromptAlbum"
		WHERE "workspaceId" IN (?, ?) AND "id" IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var category sql.NullString
		if err := rows.Scan(&id, &category); err != nil {
			return nil, err
		}
		if category.Valid {
			result[id] = category.String
		}
	}
	return result, rows.Err()
}

func categoryIntersects(raw string, blocked map[string]struct{}) bool {
	for _, id := range categoryIDList(raw) {
		if _, ok := blocked[id]; ok {
			return true
		}
	}
	return false
}

func categoriesWithout(raw string, blocked map[string]struct{}) string {
	kept := []string{}
	for _, id := range categoryIDList(raw) {
		if _, ok := blocked[id]; !ok {
			kept = append(kept, id)
		}
	}
	body, _ := json.Marshal(kept)
	return string(body)
}

func categoryIDList(raw string) []string {
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range parsed {
		text, ok := item.(string)
		if !ok || text == "" {
			continue
		}
		if _, ok := seen[text]; ok {
			continue
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids
}

func releaseTable(table string) bool {
	switch table {
	case "PersonaAsset", "SceneAsset", "OutfitAsset", "ActionAsset":
		return true
	default:
		return false
	}
}
