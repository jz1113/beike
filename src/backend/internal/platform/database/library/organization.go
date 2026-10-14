package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
)

type OrganizationCategory struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	Name        string  `json:"name"`
	ParentID    *string `json:"parentId"`
	Position    int     `json:"position"`
	IsArchived  bool    `json:"isArchived"`
	Aliases     string  `json:"aliases"`
	Keywords    string  `json:"keywords"`
	Anatomy     string  `json:"anatomy"`
	IsReadOnly  bool    `json:"isReadOnly"`
}

type OrganizationAlbum struct {
	ID                string  `json:"id"`
	WorkspaceID       string  `json:"workspaceId"`
	Name              string  `json:"name"`
	SourceKey         string  `json:"sourceKey"`
	ProductCategoryID *string `json:"productCategoryId"`
	CreatedAt         string  `json:"createdAt"`
}

type AssetOrganization struct {
	Categories []OrganizationCategory `json:"categories"`
	Albums     []OrganizationAlbum    `json:"albums"`
}

func ListAssetOrganization(ctx context.Context, db *sql.DB, workspace string) (AssetOrganization, error) {
	categories, err := listOrganizationCategories(ctx, db, workspace)
	if err != nil {
		return AssetOrganization{}, err
	}
	albums, err := listOrganizationAlbums(ctx, db, workspace)
	if err != nil {
		return AssetOrganization{}, err
	}
	if categories == nil {
		categories = []OrganizationCategory{}
	}
	if albums == nil {
		albums = []OrganizationAlbum{}
	}
	return AssetOrganization{Categories: categories, Albums: albums}, nil
}

func listOrganizationCategories(ctx context.Context, db *sql.DB, workspace string) ([]OrganizationCategory, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "name", "parentId", "position", "isArchived", "aliases", "keywords", "anatomy"
		FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?)
		ORDER BY "position" ASC, "id" ASC`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	categories := []OrganizationCategory{}
	for rows.Next() {
		var category OrganizationCategory
		var parent sql.NullString
		var archived int
		if err := rows.Scan(&category.ID, &category.WorkspaceID, &category.Name, &parent, &category.Position, &archived, &category.Aliases, &category.Keywords, &category.Anatomy); err != nil {
			return nil, err
		}
		if parent.Valid && parent.String != "" {
			category.ParentID = &parent.String
		}
		category.IsArchived = archived != 0
		categories = append(categories, category)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for index := range categories {
		categories[index].IsReadOnly = categoryReadOnly(categories[index], categories, workspace)
	}
	return categories, nil
}

func categoryReadOnly(category OrganizationCategory, categories []OrganizationCategory, workspace string) bool {
	if category.WorkspaceID != workspace {
		return true
	}
	if category.ParentID == nil {
		return false
	}
	for _, parent := range categories {
		if parent.ID == *category.ParentID && parent.WorkspaceID == workspace && !parent.IsArchived {
			return false
		}
	}
	return true
}

func listOrganizationAlbums(ctx context.Context, db *sql.DB, workspace string) ([]OrganizationAlbum, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "name", "sourceKey", "productCategoryId", "createdAt"
		FROM "PromptAlbum"
		WHERE "workspaceId" IN (?, ?)
		ORDER BY "createdAt" DESC`, workspace, database.OfficialWorkspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	albums := []OrganizationAlbum{}
	for rows.Next() {
		var album OrganizationAlbum
		var category sql.NullString
		var createdAt string
		if err := rows.Scan(&album.ID, &album.WorkspaceID, &album.Name, &album.SourceKey, &category, &createdAt); err != nil {
			return nil, err
		}
		if category.Valid {
			album.ProductCategoryID = &category.String
		}
		album.CreatedAt = database.FormatSQLiteTime(createdAt)
		albums = append(albums, album)
	}
	return albums, rows.Err()
}

func ReorderProductCategories(ctx context.Context, db *sql.DB, workspace string, parentID *string, ids []string) (AssetOrganization, error) {
	siblings, err := listCategorySiblingIDs(ctx, db, workspace, parentID)
	if err != nil {
		return AssetOrganization{}, err
	}
	if !coversIDs(siblings, ids) {
		return AssetOrganization{}, errReorderIncomplete
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AssetOrganization{}, err
	}
	for position, id := range ids {
		result, err := tx.ExecContext(ctx, `
			UPDATE "AssetProductCategory" SET "position" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, position, id, workspace)
		if err != nil {
			_ = tx.Rollback()
			return AssetOrganization{}, err
		}
		updated, _ := result.RowsAffected()
		if updated != 1 {
			_ = tx.Rollback()
			return AssetOrganization{}, errReorderMissing
		}
	}
	if err := tx.Commit(); err != nil {
		return AssetOrganization{}, err
	}
	return ListAssetOrganization(ctx, db, workspace)
}

var (
	errReorderIncomplete = database.ErrText("排序必须包含全部同级品类")
	errReorderMissing    = database.ErrText("An operation failed because it depends on one or more records that were required but not found. Record to update not found.")
)

func listCategorySiblingIDs(ctx context.Context, db *sql.DB, workspace string, parentID *string) ([]string, error) {
	query := `
		SELECT "id" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" IS NULL`
	args := []any{workspace, database.OfficialWorkspace}
	if parentID != nil {
		query = `
			SELECT "id" FROM "AssetProductCategory"
			WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`
		args = append(args, *parentID)
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func coversIDs(siblings, ids []string) bool {
	if len(siblings) != len(ids) {
		return false
	}
	seen := map[string]struct{}{}
	for _, id := range ids {
		seen[id] = struct{}{}
	}
	for _, id := range siblings {
		if _, ok := seen[id]; !ok {
			return false
		}
	}
	return true
}
