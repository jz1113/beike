package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

type PromptGroupMove struct {
	Organization  AssetOrganization
	MovedCount    int
	AffectedCount int
}

func MovePromptGroups(ctx context.Context, db *sql.DB, workspace string, ids []string, categoryID, subcategory *string) (PromptGroupMove, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return PromptGroupMove{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if categoryID != nil && strings.TrimSpace(*categoryID) == "" {
		return PromptGroupMove{}, errOneMajorCategory
	}
	resolved, err := resolveMajorCategory(ctx, tx, workspace, categoryID)
	if err != nil {
		return PromptGroupMove{}, err
	}
	if err := validateGroupSubcategory(ctx, tx, workspace, resolved, subcategory); err != nil {
		return PromptGroupMove{}, err
	}
	groups, err := loadPromptGroups(ctx, tx, workspace, ids)
	if err != nil {
		return PromptGroupMove{}, err
	}
	albumIDs := groupAlbumIDs(groups)
	affected, err := countAffectedGroups(ctx, tx, workspace, ids, albumIDs)
	if err != nil {
		return PromptGroupMove{}, err
	}
	for _, albumID := range albumIDs {
		if err := assignAlbumCategory(ctx, tx, workspace, albumID, resolved); err != nil {
			return PromptGroupMove{}, err
		}
	}
	if err := updateMovedGroups(ctx, tx, workspace, ids, resolved, subcategory); err != nil {
		return PromptGroupMove{}, err
	}
	if err := tx.Commit(); err != nil {
		return PromptGroupMove{}, err
	}
	committed = true
	organization, err := ListAssetOrganization(ctx, db, workspace)
	if err != nil {
		return PromptGroupMove{}, err
	}
	return PromptGroupMove{Organization: organization, MovedCount: len(ids), AffectedCount: affected}, nil
}

func validateGroupSubcategory(ctx context.Context, tx *sql.Tx, workspace string, categoryID, subcategory *string) error {
	if subcategory == nil {
		return nil
	}
	if categoryID == nil {
		return errChooseMajor
	}
	if builtinSubcategory(*subcategory) {
		if *categoryID != "digital_3c" {
			return errDigitalOnly
		}
		var archived int
		err := tx.QueryRowContext(ctx, `
			SELECT "isArchived" FROM "AssetProductCategory"
			WHERE "id" = ? AND "workspaceId" IN (?, ?)`, builtinFolderID(*subcategory), workspace, officialWorkspace).Scan(&archived)
		if err == sql.ErrNoRows {
			return nil
		}
		if err != nil {
			return err
		}
		if archived != 0 {
			return errFolderDeleted
		}
		return nil
	}
	if !strings.HasPrefix(*subcategory, promptSubcategoryPrefix) {
		return errSubcategoryInvalid
	}
	var parent sql.NullString
	var archived int
	var owner string
	err := tx.QueryRowContext(ctx, `
		SELECT "parentId", "isArchived", "workspaceId" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, *subcategory, workspace, officialWorkspace).Scan(&parent, &archived, &owner)
	if err == sql.ErrNoRows {
		return errFolderMissing
	}
	if err != nil {
		return err
	}
	if !parent.Valid || parent.String != *categoryID || archived != 0 || owner != workspace {
		return errFolderMissing
	}
	return nil
}

func loadPromptGroups(ctx context.Context, tx *sql.Tx, workspace string, ids []string) ([]promptGroupRow, error) {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{workspace, officialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "albumId", "workspaceId" FROM "FullPromptAsset"
		WHERE "workspaceId" IN (?, ?) AND "id" IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	groups := []promptGroupRow{}
	for rows.Next() {
		var group promptGroupRow
		var album sql.NullString
		if err := rows.Scan(&group.id, &album, &group.workspace); err != nil {
			return nil, err
		}
		if album.Valid && album.String != "" {
			group.albumID = album.String
		}
		groups = append(groups, group)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(groups) != len(ids) {
		return nil, errGroupMissing
	}
	for _, group := range groups {
		if group.workspace != workspace {
			return nil, errOfficialGroup
		}
	}
	return groups, nil
}

type promptGroupRow struct {
	id, workspace, albumID string
}

func groupAlbumIDs(groups []promptGroupRow) []string {
	seen := map[string]struct{}{}
	ids := []string{}
	for _, group := range groups {
		if group.albumID == "" {
			continue
		}
		if _, ok := seen[group.albumID]; ok {
			continue
		}
		seen[group.albumID] = struct{}{}
		ids = append(ids, group.albumID)
	}
	return ids
}

func countAffectedGroups(ctx context.Context, tx *sql.Tx, workspace string, ids, albumIDs []string) (int, error) {
	args := []any{workspace, officialWorkspace}
	idMarks := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	for _, id := range ids {
		args = append(args, id)
	}
	query := `SELECT COUNT(*) FROM "FullPromptAsset" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + idMarks + `)`
	if len(albumIDs) > 0 {
		albumMarks := strings.TrimRight(strings.Repeat("?,", len(albumIDs)), ",")
		query = `SELECT COUNT(*) FROM "FullPromptAsset" WHERE "workspaceId" IN (?, ?) AND ("id" IN (` + idMarks + `) OR "albumId" IN (` + albumMarks + `))`
		for _, id := range albumIDs {
			args = append(args, id)
		}
	}
	var count int
	err := tx.QueryRowContext(ctx, query, args...).Scan(&count)
	return count, err
}

func updateMovedGroups(ctx context.Context, tx *sql.Tx, workspace string, ids []string, categoryID, subcategory *string) error {
	categories := "[]"
	if categoryID != nil {
		body, err := json.Marshal([]string{*categoryID})
		if err != nil {
			return err
		}
		categories = string(body)
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{categories, subcategory, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), workspace}
	for _, id := range ids {
		args = append(args, id)
	}
	_, err := tx.ExecContext(ctx, `
		UPDATE "FullPromptAsset"
		SET "productCategoryIds" = ?, "productSubcategory" = ?, "isUniversal" = 0, "updatedAt" = ?
		WHERE "workspaceId" = ? AND "id" IN (`+placeholders+`)`, args...)
	return err
}

func builtinSubcategory(value string) bool {
	switch value {
	case "phone", "case", "earphone", "tablet":
		return true
	default:
		return false
	}
}

func builtinFolderID(value string) string {
	return promptSubcategoryPrefix + "digital_3c:" + value
}

const promptSubcategoryPrefix = "prompt_subcategory:"

var (
	errChooseMajor        = errText("请先选择商品大类")
	errDigitalOnly        = errText("数码细分只能用于手机数码")
	errFolderDeleted      = errText("目标文件夹已删除")
	errFolderMissing      = errText("目标文件夹不存在")
	errSubcategoryInvalid = errText("商品细分无效")
	errGroupMissing       = errText("母组不存在或不可移动")
	errOfficialGroup      = errText("官方母组不可移动")
	errOneMajorCategory   = errText("图组只能选择一个商品大类")
)
