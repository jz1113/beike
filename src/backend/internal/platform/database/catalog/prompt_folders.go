package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	"context"
	"database/sql"
	"encoding/json"
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

func importOneFolderRule(ctx context.Context, tx *sql.Tx, workspace, parentID, mode, name string, keywords, anatomy []string, hasAnatomy bool, siblings *[]ruleFolder, position *int) (bool, error) {
	var same []ruleFolder
	for _, sibling := range *siblings {
		if sibling.name == name {
			same = append(same, sibling)
		}
	}
	var candidates []ruleFolder
	for _, sibling := range same {
		if !sibling.archived && sibling.workspace == workspace {
			candidates = append(candidates, sibling)
		}
	}
	if len(candidates) > 1 {
		return false, database.ErrText("同名文件夹「" + name + "」存在多条记录，请先整理分类")
	}
	if len(candidates) == 0 && len(same) > 0 {
		return false, database.ErrText("文件夹「" + name + "」已归档或不属于当前工作区")
	}
	if len(candidates) == 1 {
		existing := candidates[0]
		storedKeywords := keywords
		if mode == "append" {
			merged, err := mergeRuleWords(existing.keywords, keywords, 200)
			if err != nil {
				return false, err
			}
			storedKeywords = merged
		}
		storedAnatomy := existing.anatomy
		if storedAnatomy == "" {
			storedAnatomy = "[]"
		}
		if hasAnatomy {
			values := anatomy
			if mode == "append" {
				merged, err := mergeRuleWords(existing.anatomy, anatomy, 32)
				if err != nil {
					return false, err
				}
				values = merged
			}
			body, _ := json.Marshal(values)
			storedAnatomy = string(body)
		}
		keywordJSON, _ := json.Marshal(storedKeywords)
		if _, err := tx.ExecContext(ctx, `
			UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, string(keywordJSON), storedAnatomy, existing.id, workspace); err != nil {
			return false, err
		}
		return false, nil
	}
	id, err := newImportedFolderID(ctx, tx, workspace, parentID, name)
	if err != nil {
		return false, err
	}
	anatomyJSON := "[]"
	if hasAnatomy {
		body, _ := json.Marshal(anatomy)
		anatomyJSON = string(body)
	}
	keywordJSON, _ := json.Marshal(keywords)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory"
		("id","workspaceId","name","parentId","position","isArchived","aliases","keywords","anatomy")
		VALUES (?,?,?,?,?,0,'[]',?,?)`, id, workspace, name, parentID, *position, string(keywordJSON), anatomyJSON); err != nil {
		return false, err
	}
	*siblings = append(*siblings, ruleFolder{id: id, name: name, workspace: workspace, parentID: &parentID, position: *position, keywords: string(keywordJSON), anatomy: anatomyJSON})
	*position++
	return true, nil
}

func newImportedFolderID(ctx context.Context, tx *sql.Tx, workspace, parentID, name string) (string, error) {
	kind := ""
	if parentID == "digital_3c" {
		kind = builtinKindByLabel(name)
	}
	if kind == "" {
		return newPromptFolderID()
	}
	id := database.BuiltinFolderID(kind)
	existing, err := findScopedCategory(ctx, tx, workspace, id)
	if err != nil {
		return "", err
	}
	if existing != nil && (existing.archived || existing.workspace != workspace) {
		return "", database.ErrText("内置文件夹「" + name + "」已归档或不属于当前工作区")
	}
	if existing == nil {
		return id, nil
	}
	return newPromptFolderID()
}

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
	unique := database.UniqueIDs(ids)
	if len(unique) == 0 {
		return result, nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(unique)), ",")
	args := []any{workspace, database.OfficialWorkspace}
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
	for _, id := range database.CategoryIDList(raw) {
		if _, ok := blocked[id]; ok {
			return true
		}
	}
	return false
}

func categoriesWithout(raw string, blocked map[string]struct{}) string {
	kept := []string{}
	for _, id := range database.CategoryIDList(raw) {
		if _, ok := blocked[id]; !ok {
			kept = append(kept, id)
		}
	}
	body, _ := json.Marshal(kept)
	return string(body)
}

func releaseTable(table string) bool {
	switch table {
	case "PersonaAsset", "SceneAsset", "OutfitAsset", "ActionAsset":
		return true
	default:
		return false
	}
}

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
