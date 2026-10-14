package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

func ClassifyAlbums(ctx context.Context, db *sql.DB, workspace string, ids []string, categoryID *string) (AssetOrganization, error) {
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
	resolved, err := resolveMajorCategory(ctx, tx, workspace, categoryID)
	if err != nil {
		return AssetOrganization{}, err
	}
	if err := requireAlbums(ctx, tx, workspace, ids); err != nil {
		return AssetOrganization{}, err
	}
	for _, id := range ids {
		if err := assignAlbumCategory(ctx, tx, workspace, id, resolved); err != nil {
			return AssetOrganization{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return AssetOrganization{}, err
	}
	committed = true
	return ListAssetOrganization(ctx, db, workspace)
}

func resolveMajorCategory(ctx context.Context, tx *sql.Tx, workspace string, categoryID *string) (*string, error) {
	if categoryID == nil {
		return nil, nil
	}
	var parent sql.NullString
	var archived int
	err := tx.QueryRowContext(ctx, `
		SELECT "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, *categoryID, workspace, officialWorkspace).Scan(&parent, &archived)
	if err == sql.ErrNoRows {
		return nil, errMajorMissing
	}
	if err != nil {
		return nil, err
	}
	if (parent.Valid && parent.String != "") || archived != 0 {
		return nil, errMajorUnavailable
	}
	return categoryID, nil
}

func requireAlbums(ctx context.Context, tx *sql.Tx, workspace string, ids []string) error {
	unique := map[string]struct{}{}
	for _, id := range ids {
		unique[id] = struct{}{}
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(unique)), ",")
	args := []any{workspace, officialWorkspace}
	for id := range unique {
		args = append(args, id)
	}
	var count int
	query := `SELECT COUNT(*) FROM "PromptAlbum" WHERE "workspaceId" IN (?, ?) AND "id" IN (` + placeholders + `)`
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return err
	}
	if count != len(unique) {
		return errAlbumMissing
	}
	return nil
}

func assignAlbumCategory(ctx context.Context, tx *sql.Tx, workspace, albumID string, categoryID *string) error {
	var owner string
	var current sql.NullString
	err := tx.QueryRowContext(ctx, `
		SELECT "workspaceId", "productCategoryId" FROM "PromptAlbum"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, albumID, workspace, officialWorkspace).Scan(&owner, &current)
	if err == sql.ErrNoRows {
		return errAlbumMissing
	}
	if err != nil {
		return err
	}
	if owner != workspace {
		return errOfficialAlbum
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE "PromptAlbum" SET "productCategoryId" = ? WHERE "id" = ? AND "workspaceId" = ?`,
		categoryID, albumID, workspace); err != nil {
		return err
	}
	keepSubcategory := (!current.Valid && categoryID == nil) || (current.Valid && categoryID != nil && current.String == *categoryID)
	categories := "[]"
	if categoryID != nil {
		body, err := json.Marshal([]string{*categoryID})
		if err != nil {
			return err
		}
		categories = string(body)
	}
	updatedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	query := `
		UPDATE "FullPromptAsset" SET "productCategoryIds" = ?, "isUniversal" = 0, "updatedAt" = ?
		WHERE "albumId" = ? AND "workspaceId" = ?`
	args := []any{categories, updatedAt, albumID, workspace}
	if !keepSubcategory {
		query = `
			UPDATE "FullPromptAsset" SET "productCategoryIds" = ?, "isUniversal" = 0, "productSubcategory" = NULL, "updatedAt" = ?
			WHERE "albumId" = ? AND "workspaceId" = ?`
	}
	_, err = tx.ExecContext(ctx, query, args...)
	return err
}

var (
	errMajorMissing     = errText("商品大类不存在")
	errMajorUnavailable = errText("请选择可用的商品大类")
	errAlbumMissing     = errText("图集不存在")
	errOfficialAlbum    = errText("官方图集不可修改")
)
