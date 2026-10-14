package database

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"strings"
)

type CategorySave struct {
	ID       *string
	Name     string
	ParentID *string
}

func SaveProductCategory(ctx context.Context, db *sql.DB, workspace string, input CategorySave) (AssetOrganization, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || utf16Len(name) > 40 {
		return AssetOrganization{}, errCategoryName
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
	var existing *storedProductCategory
	if input.ID != nil {
		existing, err = findScopedCategory(ctx, tx, workspace, *input.ID)
		if err != nil {
			return AssetOrganization{}, err
		}
		if existing == nil {
			return AssetOrganization{}, errCategoryMissing
		}
		if existing.archived {
			return AssetOrganization{}, errCategoryArchived
		}
	}
	parentID := input.ParentID
	if existing != nil {
		parentID = existing.parentID
	}
	if parentID != nil {
		parent, err := findScopedCategory(ctx, tx, workspace, *parentID)
		if err != nil {
			return AssetOrganization{}, err
		}
		if parent == nil {
			return AssetOrganization{}, errCategoryMissing
		}
		if parent.parentID != nil {
			return AssetOrganization{}, errCategoryDepth
		}
		if parent.archived {
			return AssetOrganization{}, errCategoryParentArchived
		}
	}
	duplicate, err := findNamedCategory(ctx, tx, workspace, name, parentID, existing)
	if err != nil {
		return AssetOrganization{}, err
	}
	if duplicate != nil && !duplicate.archived {
		return AssetOrganization{}, errCategoryDuplicate
	}
	switch {
	case existing != nil:
		if err := renameCategory(ctx, tx, workspace, existing.id, name); err != nil {
			return AssetOrganization{}, err
		}
	case duplicate != nil:
		if err := restoreCategory(ctx, tx, workspace, duplicate.id); err != nil {
			return AssetOrganization{}, err
		}
	default:
		if err := insertCategory(ctx, tx, workspace, name, parentID); err != nil {
			return AssetOrganization{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return AssetOrganization{}, err
	}
	committed = true
	return ListAssetOrganization(ctx, db, workspace)
}

type storedProductCategory struct {
	id, workspace string
	parentID      *string
	archived      bool
}

func findScopedCategory(ctx context.Context, tx *sql.Tx, workspace, id string) (*storedProductCategory, error) {
	var row storedProductCategory
	var parent sql.NullString
	var archived int
	err := tx.QueryRowContext(ctx, `
		SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, id, workspace, officialWorkspace).Scan(&row.id, &row.workspace, &parent, &archived)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if parent.Valid && parent.String != "" {
		row.parentID = &parent.String
	}
	row.archived = archived != 0
	return &row, nil
}

func findNamedCategory(ctx context.Context, tx *sql.Tx, workspace, name string, parentID *string, existing *storedProductCategory) (*storedProductCategory, error) {
	query := `
		SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "name" = ? AND "workspaceId" IN (?, ?) AND "parentId" IS NULL`
	args := []any{name, workspace, officialWorkspace}
	if parentID != nil {
		query = `
			SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
			WHERE "name" = ? AND "workspaceId" IN (?, ?) AND "parentId" = ?`
		args = append(args, *parentID)
	}
	if existing != nil {
		query += ` AND "id" != ?`
		args = append(args, existing.id)
	}
	query += ` ORDER BY "id" ASC`
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var first *storedProductCategory
	for rows.Next() {
		var row storedProductCategory
		var parent sql.NullString
		var archived int
		if err := rows.Scan(&row.id, &row.workspace, &parent, &archived); err != nil {
			return nil, err
		}
		if parent.Valid && parent.String != "" {
			row.parentID = &parent.String
		}
		row.archived = archived != 0
		if !row.archived {
			return &row, nil
		}
		if first == nil {
			copied := row
			first = &copied
		}
	}
	return first, rows.Err()
}

func renameCategory(ctx context.Context, tx *sql.Tx, workspace, id, name string) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE "AssetProductCategory" SET "name" = ?, "isArchived" = 0
		WHERE "id" = ? AND "workspaceId" = ?`, name, id, workspace)
	return categoryWriteResult(result, err)
}

func restoreCategory(ctx context.Context, tx *sql.Tx, workspace, id string) error {
	result, err := tx.ExecContext(ctx, `
		UPDATE "AssetProductCategory" SET "isArchived" = 0
		WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	return categoryWriteResult(result, err)
}

func insertCategory(ctx context.Context, tx *sql.Tx, workspace, name string, parentID *string) error {
	var count int
	query := `SELECT COUNT(*) FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" IS NULL`
	args := []any{workspace, officialWorkspace}
	if parentID != nil {
		query = `SELECT COUNT(*) FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`
		args = append(args, *parentID)
	}
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return err
	}
	id, err := newCategoryRecordID()
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,0,'[]','[]','[]')`, id, workspace, name, parentID, count)
	return err
}

func categoryWriteResult(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	updated, _ := result.RowsAffected()
	if updated != 1 {
		return errCategoryMissing
	}
	return nil
}

func newCategoryRecordID() (string, error) {
	var buf [12]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "c" + hex.EncodeToString(buf[:]), nil
}

func utf16Len(value string) int {
	count := 0
	for _, char := range value {
		count++
		if char > 0xFFFF {
			count++
		}
	}
	return count
}

var (
	errCategoryName           = errText("品类名称需为 1–40 个字")
	errCategoryArchived       = errText("文件夹已删除，请刷新后重试")
	errCategoryDepth          = errText("商品品类最多两级")
	errCategoryParentArchived = errText("父文件夹已删除，不可编辑")
	errCategoryDuplicate      = errText("同级品类名称已存在")
	errCategoryMissing        = errText("No AssetProductCategory found")
)
