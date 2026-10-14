package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"database/sql"
	"strings"
)

func SavePromptSubcategory(ctx context.Context, db *sql.DB, workspace, parentID, value, name string) (dblibrary.AssetOrganization, error) {
	if name == "" || utf16Len(name) > 40 {
		return dblibrary.AssetOrganization{}, errFolderName
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	parent, err := findCategoryWorkspace(ctx, tx, parentID, workspace, database.OfficialWorkspace, "legacy")
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if parent == nil || parent.parentID != nil || parent.archived || (parent.workspace != workspace && parent.workspace != "legacy") {
		return dblibrary.AssetOrganization{}, errMajorUneditable
	}
	if value != "" && !database.BuiltinSubcategory(value) && !strings.HasPrefix(value, database.PromptSubcategoryPrefix) {
		return dblibrary.AssetOrganization{}, errSubfolderInvalid
	}
	if database.BuiltinSubcategory(value) && parentID != "digital_3c" {
		return dblibrary.AssetOrganization{}, errDigitalOnly
	}
	id, err := subcategoryRecordID(ctx, tx, workspace, parentID, value, name)
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	existing, err := findScopedCategory(ctx, tx, workspace, id)
	if err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if value != "" && existing != nil && existing.archived {
		return dblibrary.AssetOrganization{}, errCategoryArchived
	}
	if value != "" && strings.HasPrefix(value, database.PromptSubcategoryPrefix) && (existing == nil || existing.parentID == nil || *existing.parentID != parentID) {
		return dblibrary.AssetOrganization{}, errSubfolderAbsent
	}
	if existing != nil && (existing.parentID == nil || *existing.parentID != parentID) {
		return dblibrary.AssetOrganization{}, errSubfolderParent
	}
	if err := rejectDuplicateSubfolderName(ctx, tx, workspace, parentID, id, name); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if existing != nil {
		if err := renameCategory(ctx, tx, workspace, id, name); err != nil {
			return dblibrary.AssetOrganization{}, err
		}
	} else if err := insertSubfolder(ctx, tx, workspace, parentID, id, name); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	if err := tx.Commit(); err != nil {
		return dblibrary.AssetOrganization{}, err
	}
	committed = true
	return dblibrary.ListAssetOrganization(ctx, db, workspace)
}

func subcategoryRecordID(ctx context.Context, tx *sql.Tx, workspace, parentID, value, name string) (string, error) {
	if database.BuiltinSubcategory(value) {
		return database.BuiltinFolderID(value), nil
	}
	if value != "" {
		return value, nil
	}
	archived, err := archivedSiblingID(ctx, tx, workspace, parentID, name)
	if err != nil || archived != "" {
		return archived, err
	}
	if parentID == "digital_3c" {
		if kind := builtinKindByLabel(name); kind != "" {
			return database.BuiltinFolderID(kind), nil
		}
	}
	return newPromptFolderID()
}

func archivedSiblingID(ctx context.Context, tx *sql.Tx, workspace, parentID, name string) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, `
		SELECT "id" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" = ? AND "name" = ? AND "isArchived" = 1
		ORDER BY "id" ASC LIMIT 1`, workspace, database.OfficialWorkspace, parentID, name).Scan(&id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return id, err
}

func rejectDuplicateSubfolderName(ctx context.Context, tx *sql.Tx, workspace, parentID, id, name string) error {
	names, err := activeSubfolderNames(ctx, tx, workspace, parentID, id)
	if err != nil {
		return err
	}
	if parentID == "digital_3c" {
		for _, kind := range []string{"phone", "case", "earphone", "tablet"} {
			folderID := database.BuiltinFolderID(kind)
			if folderID == id {
				continue
			}
			exists, err := categoryIDExists(ctx, tx, workspace, folderID)
			if err != nil {
				return err
			}
			if !exists {
				names = append(names, subcategoryLabel(kind))
			}
		}
	}
	for _, existing := range names {
		if existing == name {
			return errSiblingFolder
		}
	}
	return nil
}

func activeSubfolderNames(ctx context.Context, tx *sql.Tx, workspace, parentID, id string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "name" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" = ? AND "isArchived" = 0 AND "id" != ?`,
		workspace, database.OfficialWorkspace, parentID, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := []string{}
	for rows.Next() {
		var folderID, folderName string
		if err := rows.Scan(&folderID, &folderName); err != nil {
			return nil, err
		}
		if strings.HasPrefix(folderID, database.PromptSubcategoryPrefix) {
			names = append(names, folderName)
		}
	}
	return names, rows.Err()
}

func categoryIDExists(ctx context.Context, tx *sql.Tx, workspace, id string) (bool, error) {
	var found string
	err := tx.QueryRowContext(ctx, `
		SELECT "id" FROM "AssetProductCategory" WHERE "id" = ? AND "workspaceId" IN (?, ?)`,
		id, workspace, database.OfficialWorkspace).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func findCategoryWorkspace(ctx context.Context, tx *sql.Tx, id, workspace, official, legacy string) (*storedProductCategory, error) {
	var row storedProductCategory
	var parent sql.NullString
	var archived int
	err := tx.QueryRowContext(ctx, `
		SELECT "id", "workspaceId", "parentId", "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?, ?)`, id, workspace, official, legacy).Scan(&row.id, &row.workspace, &parent, &archived)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	row.id = id
	if parent.Valid && parent.String != "" {
		row.parentID = &parent.String
	}
	row.archived = archived != 0
	return &row, nil
}

func insertSubfolder(ctx context.Context, tx *sql.Tx, workspace, parentID, id, name string) error {
	var count int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`,
		workspace, database.OfficialWorkspace, parentID).Scan(&count); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,0,'[]','[]','[]')`, id, workspace, name, parentID, count)
	return err
}

var (
	errFolderName      = database.ErrText("文件夹名称需为 1–40 个字")
	errSubfolderAbsent = database.ErrText("细分文件夹不存在")
	errSubfolderParent = database.ErrText("细分文件夹不属于当前大类")
	errSiblingFolder   = database.ErrText("同级文件夹名称已存在")
)
