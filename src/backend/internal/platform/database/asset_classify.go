package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

func ClassifiableAssetType(assetType string) bool {
	_, ok := assetTable(assetType)
	return ok
}

func ClassifyAssets(ctx context.Context, db *sql.DB, workspace, assetType string, ids, categories []string, universal bool) (AssetOrganization, error) {
	table, ok := assetTable(assetType)
	if !ok {
		return AssetOrganization{}, errAssetByAlbum
	}
	if categories == nil {
		categories = []string{}
	}
	encoded, err := json.Marshal(categories)
	if err != nil {
		return AssetOrganization{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AssetOrganization{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := requireCategoryIDs(ctx, tx, workspace, categories); err != nil {
		return AssetOrganization{}, err
	}
	if err := requireAssetIDs(ctx, tx, table, workspace, ids); err != nil {
		return AssetOrganization{}, err
	}
	if err := updateAssetCategories(ctx, tx, table, workspace, ids, string(encoded), universal); err != nil {
		return AssetOrganization{}, err
	}
	if err := tx.Commit(); err != nil {
		return AssetOrganization{}, err
	}
	committed = true
	return ListAssetOrganization(ctx, db, workspace)
}

func assetTable(assetType string) (string, bool) {
	switch assetType {
	case "scene", "scene_bundle":
		return "SceneAsset", true
	case "outfit":
		return "OutfitAsset", true
	case "action":
		return "ActionAsset", true
	case "persona":
		return "PersonaAsset", true
	default:
		return "", false
	}
}

func requireCategoryIDs(ctx context.Context, tx *sql.Tx, workspace string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	count, err := countScopedIDs(ctx, tx, "AssetProductCategory", workspace, ids)
	if err != nil {
		return err
	}
	if count != len(ids) {
		return errCategoryIDs
	}
	return nil
}

func requireAssetIDs(ctx context.Context, tx *sql.Tx, table, workspace string, ids []string) error {
	unique := uniqueIDs(ids)
	count, err := countScopedIDs(ctx, tx, table, workspace, unique)
	if err != nil {
		return err
	}
	if count != len(unique) {
		return errAssetMissing
	}
	return nil
}

func countScopedIDs(ctx context.Context, tx *sql.Tx, table, workspace string, ids []string) (int, error) {
	if !safeAssetTable(table) || len(ids) == 0 {
		return 0, nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{workspace, officialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	var count int
	query := `SELECT COUNT(*) FROM "` + table + `" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + placeholders + `)`
	err := tx.QueryRowContext(ctx, query, args...).Scan(&count)
	return count, err
}

func updateAssetCategories(ctx context.Context, tx *sql.Tx, table, workspace string, ids []string, categories string, universal bool) error {
	if !safeAssetTable(table) {
		return errAssetByAlbum
	}
	flag := 0
	if universal {
		flag = 1
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{categories, flag, workspace}
	for _, id := range ids {
		args = append(args, id)
	}
	query := `UPDATE "` + table + `" SET "productCategoryIds" = ?, "isUniversal" = ? WHERE "workspaceId" = ? AND "id" IN (` + placeholders + `)`
	_, err := tx.ExecContext(ctx, query, args...)
	return err
}

func safeAssetTable(table string) bool {
	switch table {
	case "SceneAsset", "OutfitAsset", "ActionAsset", "PersonaAsset", "AssetProductCategory":
		return true
	default:
		return false
	}
}

func uniqueIDs(ids []string) []string {
	seen := map[string]struct{}{}
	unique := []string{}
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	return unique
}

var (
	errAssetByAlbum = errText("完整提示词请按图集调整归属")
	errAssetMissing = errText("素材不存在")
	errCategoryIDs  = errText("商品品类不存在")
)
