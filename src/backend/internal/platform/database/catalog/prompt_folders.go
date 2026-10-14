package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"database/sql"
	"strings"
)

type FolderArchive struct {
	Organization  dblibrary.AssetOrganization
	ArchivedCount int
	ReleasedCount int
}

func ArchivePromptFolders(ctx context.Context, db *sql.DB, workspace string, ids []string, parentID *string) (FolderArchive, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return FolderArchive{}, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	var released int
	if parentID != nil {
		released, err = archiveSubcategoryFolders(ctx, tx, workspace, *parentID, ids)
	} else {
		released, err = archiveMajorFolders(ctx, tx, workspace, ids)
	}
	if err != nil {
		return FolderArchive{}, err
	}
	if err := tx.Commit(); err != nil {
		return FolderArchive{}, err
	}
	committed = true
	organization, err := dblibrary.ListAssetOrganization(ctx, db, workspace)
	if err != nil {
		return FolderArchive{}, err
	}
	return FolderArchive{Organization: organization, ArchivedCount: len(ids), ReleasedCount: released}, nil
}

func archiveMajorFolders(ctx context.Context, tx *sql.Tx, workspace string, ids []string) (int, error) {
	folders, err := loadMajorFolders(ctx, tx, workspace, ids)
	if err != nil {
		return 0, err
	}
	if len(folders) != len(ids) {
		return 0, errMajorUndeletable
	}
	for _, folder := range folders {
		if folder != workspace {
			return 0, errMajorUndeletable
		}
	}
	children, err := childCategoryIDs(ctx, tx, workspace, ids)
	if err != nil {
		return 0, err
	}
	removed := append(append([]string{}, ids...), children...)
	albums, err := albumsInCategories(ctx, tx, workspace, ids)
	if err != nil {
		return 0, err
	}
	for _, albumID := range albums {
		if err := dblibrary.AssignAlbumCategory(ctx, tx, workspace, albumID, nil); err != nil {
			return 0, err
		}
	}
	released, err := releaseCategoryReferences(ctx, tx, workspace, removed)
	if err != nil {
		return 0, err
	}
	if err := archiveCategories(ctx, tx, workspace, ids); err != nil {
		return 0, err
	}
	return released, nil
}

func archiveSubcategoryFolders(ctx context.Context, tx *sql.Tx, workspace, parentID string, ids []string) (int, error) {
	parent, err := findScopedCategory(ctx, tx, workspace, parentID)
	if err != nil {
		return 0, err
	}
	if parent == nil || parent.parentID != nil || parent.archived || parent.workspace != workspace {
		return 0, errMajorUneditable
	}
	released := 0
	for _, value := range ids {
		count, err := archiveOneSubcategory(ctx, tx, workspace, parentID, value)
		if err != nil {
			return 0, err
		}
		released += count
	}
	return released, nil
}

func archiveOneSubcategory(ctx context.Context, tx *sql.Tx, workspace, parentID, value string) (int, error) {
	kind, builtin := subcategoryKind(value)
	if !builtin && !strings.HasPrefix(value, database.PromptSubcategoryPrefix) {
		return 0, errSubfolderInvalid
	}
	id := value
	if builtin {
		id = database.BuiltinFolderID(kind)
		if parentID != "digital_3c" {
			return 0, errDigitalOnly
		}
	}
	existing, err := findScopedCategory(ctx, tx, workspace, id)
	if err != nil {
		return 0, err
	}
	if existing != nil && (existing.parentID == nil || *existing.parentID != parentID || existing.workspace != workspace) {
		return 0, errFolderWorkspace
	}
	if existing == nil && !builtin {
		return 0, errFolderAbsent
	}
	if existing != nil {
		if err := archiveCategories(ctx, tx, workspace, []string{id}); err != nil {
			return 0, err
		}
	} else if err := insertArchivedSubfolder(ctx, tx, workspace, parentID, id, subcategoryLabel(kind)); err != nil {
		return 0, err
	}
	values := []string{value}
	if builtin {
		values = []string{kind, id}
	}
	return clearSubcategory(ctx, tx, workspace, parentID, values)
}

func loadMajorFolders(ctx context.Context, tx *sql.Tx, workspace string, ids []string) (map[string]string, error) {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{workspace, database.OfficialWorkspace}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "workspaceId" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" IS NULL AND "id" IN (`+placeholders+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	folders := map[string]string{}
	for rows.Next() {
		var id, owner string
		if err := rows.Scan(&id, &owner); err != nil {
			return nil, err
		}
		folders[id] = owner
	}
	return folders, rows.Err()
}

func childCategoryIDs(ctx context.Context, tx *sql.Tx, workspace string, parents []string) ([]string, error) {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(parents)), ",")
	args := []any{workspace, database.OfficialWorkspace}
	for _, id := range parents {
		args = append(args, id)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT "id" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" IN (`+placeholders+`)`, args...)
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

func albumsInCategories(ctx context.Context, tx *sql.Tx, workspace string, categories []string) ([]string, error) {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(categories)), ",")
	args := []any{workspace}
	for _, id := range categories {
		args = append(args, id)
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT "id" FROM "PromptAlbum" WHERE "workspaceId" = ? AND "productCategoryId" IN (`+placeholders+`)`, args...)
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

func archiveCategories(ctx context.Context, tx *sql.Tx, workspace string, ids []string) error {
	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	args := []any{workspace}
	for _, id := range ids {
		args = append(args, id)
	}
	_, err := tx.ExecContext(ctx, `
		UPDATE "AssetProductCategory" SET "isArchived" = 1
		WHERE "workspaceId" = ? AND "id" IN (`+placeholders+`)`, args...)
	return err
}

func insertArchivedSubfolder(ctx context.Context, tx *sql.Tx, workspace, parentID, id, name string) error {
	var count int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`,
		workspace, database.OfficialWorkspace, parentID).Scan(&count); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,1,'[]','[]','[]')`, id, workspace, name, parentID, count)
	return err
}

func subcategoryKind(value string) (string, bool) {
	if database.BuiltinSubcategory(value) {
		return value, true
	}
	for _, kind := range []string{"phone", "case", "earphone", "tablet"} {
		if database.BuiltinFolderID(kind) == value {
			return kind, true
		}
	}
	return "", false
}

func subcategoryLabel(kind string) string {
	switch kind {
	case "phone":
		return "手机本体"
	case "case":
		return "手机壳"
	case "earphone":
		return "耳机"
	case "tablet":
		return "平板"
	default:
		return kind
	}
}

var (
	errMajorUndeletable = database.ErrText("商品大类不存在或不可删除")
	errMajorUneditable  = database.ErrText("商品大类不存在或不可编辑")
	errSubfolderInvalid = database.ErrText("细分文件夹无效")
	errFolderWorkspace  = database.ErrText("文件夹不属于当前工作区")
	errFolderAbsent     = database.ErrText("文件夹不存在")
)
