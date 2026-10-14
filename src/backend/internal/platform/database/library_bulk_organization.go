package database

import (
	"context"
	"database/sql"
	"strings"
)

type backupMaps struct {
	categoryMap, albumMap                map[string]string
	valid, unresolved                    map[string]struct{}
	invalidMeta, invalidLists            int
	albumsWithoutKey, nameConflicts      int
	idConflicts, positionConflicts       int
	albumSourceConflicts, unmappedAlbums int
	multiCategoryAlbums                  int
	rows                                 []importedCategory
	byID                                 map[string]importedCategory
}

type importedCategory struct {
	id, name, parentID, aliases, keywords, anatomy string
	archived                                       bool
	position                                       int
}

type backupCategory struct {
	id, name, parentID, aliases, keywords, anatomy string
	hasParent                                      bool
	archived                                       *bool
	position                                       *int
	numericPosition                                bool
	positionNumber                                 float64
	rawAliases, rawKeywords, rawAnatomy            any
}

type backupAlbum struct {
	id, name, sourceKey, categoryID string
	hasSourceKey                    bool
}

func parseBackupCategories(raw any) ([]backupCategory, error) {
	if raw == nil {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, LibraryFailure{Message: "备份商品品类格式无效"}
	}
	rows := make([]backupCategory, 0, len(list))
	for _, value := range list {
		object, ok := value.(map[string]any)
		id, _ := object["id"].(string)
		name, _ := object["name"].(string)
		if !ok || id == "" || strings.TrimSpace(name) == "" {
			return nil, LibraryFailure{Message: "备份商品品类条目无效"}
		}
		row := backupCategory{id: id, name: strings.TrimSpace(name), aliases: "[]", keywords: "[]", anatomy: "[]"}
		if parent, ok := object["parentId"].(string); ok && parent != "" {
			row.parentID = parent
			row.hasParent = true
		}
		if _, present := object["isArchived"]; present {
			flag, ok := object["isArchived"].(bool)
			if !ok {
				return nil, LibraryFailure{Message: "备份文件夹状态无效"}
			}
			row.archived = &flag
		}
		if number, ok := backupNumber(object["position"]); ok {
			row.numericPosition = true
			row.positionNumber = number
			if number == float64(int(number)) && number >= 0 {
				parsed := int(number)
				row.position = &parsed
			}
		}
		row.rawAliases = object["aliases"]
		row.rawKeywords = object["keywords"]
		row.rawAnatomy = object["anatomy"]
		rows = append(rows, row)
	}
	return rows, nil
}

func parseBackupAlbums(raw any) ([]backupAlbum, error) {
	if raw == nil {
		return nil, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, LibraryFailure{Message: "备份图集格式无效"}
	}
	rows := make([]backupAlbum, 0, len(list))
	for _, value := range list {
		object, ok := value.(map[string]any)
		id, _ := object["id"].(string)
		name, _ := object["name"].(string)
		if !ok || id == "" || strings.TrimSpace(name) == "" {
			return nil, LibraryFailure{Message: "备份图集条目无效"}
		}
		row := backupAlbum{id: id, name: strings.TrimSpace(name)}
		if key, ok := object["sourceKey"].(string); ok && strings.TrimSpace(key) != "" {
			row.sourceKey = strings.TrimSpace(key)
			row.hasSourceKey = true
		}
		if category, ok := object["productCategoryId"].(string); ok {
			row.categoryID = category
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func restoreBackupOrganization(ctx context.Context, tx *sql.Tx, workspace, now string, categories []backupCategory, albums []backupAlbum, items []backupItem, maps *backupMaps) error {
	if err := loadBackupCategories(ctx, tx, workspace, maps); err != nil {
		return err
	}
	if err := restoreBackupCategories(ctx, tx, workspace, categories, maps); err != nil {
		return err
	}
	if err := restoreBuiltinFolders(ctx, tx, workspace, maps); err != nil {
		return err
	}
	if err := restoreBackupAlbums(ctx, tx, workspace, now, albums, maps); err != nil {
		return err
	}
	return restoreLegacyAlbums(ctx, tx, workspace, now, items, maps)
}

func loadBackupCategories(ctx context.Context, tx *sql.Tx, workspace string, maps *backupMaps) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT "id", "name", IFNULL("parentId", ''), "position", "isArchived", "aliases", "keywords", "anatomy"
		FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) ORDER BY rowid`, workspace, officialWorkspace)
	if err != nil {
		return err
	}
	defer rows.Close()
	maps.byID = map[string]importedCategory{}
	maps.valid = map[string]struct{}{}
	for rows.Next() {
		var row importedCategory
		var archived int
		if err := rows.Scan(&row.id, &row.name, &row.parentID, &row.position, &archived, &row.aliases, &row.keywords, &row.anatomy); err != nil {
			return err
		}
		row.archived = archived != 0
		maps.rows = append(maps.rows, row)
		maps.byID[row.id] = row
		maps.valid[row.id] = struct{}{}
	}
	return rows.Err()
}

func restoreBackupCategories(ctx context.Context, tx *sql.Tx, workspace string, categories []backupCategory, maps *backupMaps) error {
	pending := map[string]backupCategory{}
	order := make([]string, 0, len(categories))
	for index, row := range categories {
		if _, ok := pending[row.id]; ok {
			return LibraryFailure{Message: "备份商品品类 ID 重复"}
		}
		order = append(order, row.id)
		categories[index].aliases = canonicalStringList(row.rawAliases, maps)
		categories[index].keywords = canonicalStringList(row.rawKeywords, maps)
		categories[index].anatomy = canonicalStringList(row.rawAnatomy, maps)
		pending[row.id] = categories[index]
	}
	for len(pending) > 0 {
		progressed := false
		next := []string{}
		for _, oldID := range order {
			row := pending[oldID]
			if row.hasParent {
				if _, waiting := pending[row.parentID]; waiting {
					next = append(next, oldID)
					continue
				}
			}
			if err := restoreOneCategory(ctx, tx, workspace, row, maps); err != nil {
				return err
			}
			delete(pending, oldID)
			progressed = true
		}
		order = next
		if !progressed {
			return LibraryFailure{Message: "备份商品品类层级存在循环"}
		}
	}
	return nil
}

func restoreOneCategory(ctx context.Context, tx *sql.Tx, workspace string, row backupCategory, maps *backupMaps) error {
	parentID := ""
	if row.hasParent {
		parentID = mapBackupCategory(row.parentID, maps)
	}
	metadata := importedCategory{name: row.name, parentID: parentID, aliases: row.aliases, keywords: row.keywords, anatomy: row.anatomy}
	if row.archived != nil {
		metadata.archived = *row.archived
	}
	byID, hasID := maps.byID[row.id]
	if hasID && !categoryMatches(byID, metadata, row.archived == nil) {
		maps.idConflicts++
	}
	sameName := categoriesByName(maps.rows, row.name, parentID)
	existing, matched := findMatchingCategory(byID, hasID, sameName, metadata, row.archived == nil)
	if len(sameName) > 0 && !matched {
		maps.nameConflicts++
	}
	position := 0
	if row.position != nil {
		position = *row.position
	}
	if row.numericPosition && matched && float64(existing.position) != row.positionNumber {
		maps.positionConflicts++
	}
	if matched {
		maps.categoryMap[row.id] = existing.id
		maps.valid[existing.id] = struct{}{}
		return nil
	}
	id, err := newBackupCategoryID(row.id, hasID)
	if err != nil {
		return err
	}
	archived := 0
	if row.archived != nil && *row.archived {
		archived = 1
	}
	var parent any
	if parentID != "" {
		parent = parentID
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "AssetProductCategory" (
			"id", "workspaceId", "name", "parentId", "position", "isArchived", "aliases", "keywords", "anatomy"
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspace, row.name, parent, position, archived, row.aliases, row.keywords, row.anatomy); err != nil {
		return err
	}
	created := importedCategory{id: id, name: row.name, parentID: parentID, position: position, archived: archived != 0, aliases: row.aliases, keywords: row.keywords, anatomy: row.anatomy}
	maps.rows = append(maps.rows, created)
	maps.categoryMap[row.id] = id
	maps.valid[id] = struct{}{}
	return nil
}

func newBackupCategoryID(oldID string, hasExisting bool) (string, error) {
	if strings.HasPrefix(oldID, "prompt_subcategory:") {
		if hasExisting {
			id, err := newID()
			if err != nil {
				return "", err
			}
			return "prompt_subcategory:" + id, nil
		}
		return oldID, nil
	}
	return newLibraryID()
}

func restoreBuiltinFolders(ctx context.Context, tx *sql.Tx, workspace string, maps *backupMaps) error {
	parentID := maps.categoryMap["digital_3c"]
	if parentID == "" || parentID == "digital_3c" {
		return nil
	}
	labels := []struct{ value, name string }{
		{"phone", "手机本体"}, {"case", "手机壳"}, {"earphone", "耳机"}, {"tablet", "平板"},
	}
	for position, label := range labels {
		original := "prompt_subcategory:digital_3c:" + label.value
		if _, ok := maps.categoryMap[original]; ok {
			continue
		}
		id, err := newID()
		if err != nil {
			return err
		}
		id = "prompt_subcategory:" + id
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO "AssetProductCategory" ("id", "workspaceId", "name", "parentId", "position", "isArchived", "aliases", "keywords", "anatomy")
			VALUES (?, ?, ?, ?, ?, 0, '[]', '[]', '[]')`, id, workspace, label.name, parentID, position); err != nil {
			return err
		}
		maps.categoryMap[original] = id
		maps.valid[id] = struct{}{}
	}
	return nil
}
