package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

func ListRecentPromptRecords(ctx context.Context, db *sql.DB, workspace string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "productId", "productTitle", "productFingerprint", "modelUsed", "styleName", "promptsJson", "createdAt"
		FROM "PromptRecord"
		WHERE "workspaceId" = ?
		ORDER BY "createdAt" DESC
		LIMIT 50`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []map[string]any{}
	for rows.Next() {
		var id, workspaceID, promptsJSON, createdAt string
		var productID, productTitle, fingerprint, modelUsed, styleName sql.NullString
		if err := rows.Scan(&id, &workspaceID, &productID, &productTitle, &fingerprint, &modelUsed, &styleName, &promptsJSON, &createdAt); err != nil {
			return nil, err
		}
		prompts, shotCount, includeCount := parsePromptList(promptsJSON)
		record := map[string]any{
			"id": id, "workspaceId": workspaceID,
			"productId": database.NullText(productID), "productTitle": database.NullText(productTitle),
			"productFingerprint": database.NullText(fingerprint), "modelUsed": database.NullText(modelUsed),
			"styleName": database.NullText(styleName), "promptsJson": promptsJSON,
			"createdAt": database.FormatSQLiteTime(createdAt), "prompts": prompts,
		}
		if includeCount {
			record["shotCount"] = shotCount
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func parsePromptList(raw string) (any, int, bool) {
	if raw == "" {
		return []any{}, 0, true
	}
	var parsed any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []any{}, 0, true
	}
	if list, ok := parsed.([]any); ok {
		return list, len(list), true
	}
	return parsed, 0, false
}

func CreatePromptRecord(ctx context.Context, db *sql.DB, workspace string, input PromptDraft) (map[string]any, error) {
	id, err := database.RandomHex()
	if err != nil {
		return nil, err
	}
	created := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err = db.ExecContext(ctx, `
		INSERT INTO "PromptRecord" ("id", "workspaceId", "productId", "productTitle", "productFingerprint", "modelUsed", "styleName", "promptsJson", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspace, input.ProductID, input.ProductTitle, input.Fingerprint, input.ModelUsed, input.StyleName, input.PromptsJSON, created)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "productId": input.ProductID, "productTitle": input.ProductTitle,
		"productFingerprint": input.Fingerprint, "modelUsed": input.ModelUsed, "styleName": input.StyleName,
		"promptsJson": input.PromptsJSON, "createdAt": created,
	}, nil
}

func DeletePromptRecord(ctx context.Context, db *sql.DB, workspace, id string) error {
	result, err := db.ExecContext(ctx, `DELETE FROM "PromptRecord" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errPromptMissing
	}
	return nil
}

type PromptDraft struct {
	ProductID    any
	ProductTitle string
	Fingerprint  string
	ModelUsed    string
	StyleName    string
	PromptsJSON  string
}

var errPromptMissing = errors.New("记录不存在")

type PromptGroupMove struct {
	Organization  dblibrary.AssetOrganization
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
	resolved, err := dblibrary.ResolveMajorCategory(ctx, tx, workspace, categoryID)
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
		if err := dblibrary.AssignAlbumCategory(ctx, tx, workspace, albumID, resolved); err != nil {
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
	organization, err := dblibrary.ListAssetOrganization(ctx, db, workspace)
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
	if database.BuiltinSubcategory(*subcategory) {
		if *categoryID != "digital_3c" {
			return errDigitalOnly
		}
		var archived int
		err := tx.QueryRowContext(ctx, `
			SELECT "isArchived" FROM "AssetProductCategory"
			WHERE "id" = ? AND "workspaceId" IN (?, ?)`, database.BuiltinFolderID(*subcategory), workspace, database.OfficialWorkspace).Scan(&archived)
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
	if !strings.HasPrefix(*subcategory, database.PromptSubcategoryPrefix) {
		return errSubcategoryInvalid
	}
	var parent sql.NullString
	var archived int
	var owner string
	err := tx.QueryRowContext(ctx, `
		SELECT "parentId", "isArchived", "workspaceId" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, *subcategory, workspace, database.OfficialWorkspace).Scan(&parent, &archived, &owner)
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
	args := []any{workspace, database.OfficialWorkspace}
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
	args := []any{workspace, database.OfficialWorkspace}
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

var (
	errChooseMajor        = database.ErrText("请先选择商品大类")
	errDigitalOnly        = database.ErrText("数码细分只能用于手机数码")
	errFolderDeleted      = database.ErrText("目标文件夹已删除")
	errFolderMissing      = database.ErrText("目标文件夹不存在")
	errSubcategoryInvalid = database.ErrText("商品细分无效")
	errGroupMissing       = database.ErrText("母组不存在或不可移动")
	errOfficialGroup      = database.ErrText("官方母组不可移动")
	errOneMajorCategory   = database.ErrText("图组只能选择一个商品大类")
)
