package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"strings"
)

func restoreBackupAlbums(ctx context.Context, tx *sql.Tx, workspace, now string, albums []backupAlbum, maps *backupMaps) error {
	seen := map[string]struct{}{}
	for _, row := range albums {
		if _, ok := seen[row.id]; ok {
			return LibraryFailure{Message: "备份图集 ID 重复"}
		}
		seen[row.id] = struct{}{}
		categoryID := ""
		if row.categoryID != "" {
			categoryID = mapBackupCategory(row.categoryID, maps)
		}
		sourceKey := row.sourceKey
		if !row.hasSourceKey {
			id, err := database.NewID()
			if err != nil {
				return err
			}
			sourceKey = id
			maps.albumsWithoutKey++
		}
		albumID, err := insertRestoredAlbum(ctx, tx, workspace, now, row.name, sourceKey, categoryID, maps)
		if err != nil {
			return err
		}
		maps.albumMap[row.id] = albumID
	}
	return nil
}

func restoreLegacyAlbums(ctx context.Context, tx *sql.Tx, workspace, now string, items []backupItem, maps *backupMaps) error {
	type group struct {
		name, images, categories string
		count                    int
	}
	groups := map[string]*group{}
	order := []string{}
	for _, item := range items {
		oldID, _ := item.data["albumId"].(string)
		if oldID == "" {
			continue
		}
		if _, ok := maps.albumMap[oldID]; ok {
			continue
		}
		current := groups[oldID]
		if current == nil {
			current = &group{name: "未命名图集", categories: "[]"}
			groups[oldID] = current
			order = append(order, oldID)
		}
		if item.assetType == "full_prompt" {
			name, _ := item.data["albumName"].(string)
			if strings.TrimSpace(name) == "" {
				name, _ = item.data["title"].(string)
			}
			if strings.TrimSpace(name) != "" {
				current.name = strings.TrimSpace(name)
			}
		}
		count := sourceImageCount(item.data["sourceImages"])
		if count > current.count {
			current.images, _ = item.data["sourceImages"].(string)
			current.count = count
		}
		if current.categories == "[]" {
			if text, ok := item.data["productCategoryIds"].(string); ok {
				current.categories = text
			}
		}
	}
	for _, oldID := range order {
		current := groups[oldID]
		ids, _ := mappedCategoryIDs(current.categories, maps, false, false)
		if len(ids) > 1 {
			maps.multiCategoryAlbums++
		}
		categoryID := ""
		if len(ids) > 0 {
			categoryID = ids[0]
		}
		albumID, err := insertRestoredAlbum(ctx, tx, workspace, now, current.name, albumSourceKey(current.name, current.images, "backup:"+oldID), categoryID, maps)
		if err != nil {
			return err
		}
		maps.albumMap[oldID] = albumID
	}
	return nil
}

func insertRestoredAlbum(ctx context.Context, tx *sql.Tx, workspace, now, name, sourceKey, categoryID string, maps *backupMaps) (string, error) {
	var existing string
	err := tx.QueryRowContext(ctx, `SELECT "id" FROM "PromptAlbum" WHERE "workspaceId" = ? AND "sourceKey" = ?`, workspace, sourceKey).Scan(&existing)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	if err == nil {
		maps.albumSourceConflicts++
		id, idErr := database.NewID()
		if idErr != nil {
			return "", idErr
		}
		sourceKey = "backup-copy:" + id
	}
	albumID, err := newLibraryID()
	if err != nil {
		return "", err
	}
	var category any
	if categoryID != "" {
		category = categoryID
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "PromptAlbum" ("id", "workspaceId", "name", "sourceKey", "productCategoryId", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?)`, albumID, workspace, name, sourceKey, category, now)
	return albumID, err
}

func remapBackupData(data map[string]any, assetType string, maps *backupMaps) {
	remapBackupSubcategory(data, maps)
	if albumID, ok := data["albumId"].(string); ok && albumID != "" {
		if mapped, ok := maps.albumMap[albumID]; ok {
			data["albumId"] = mapped
		} else {
			data["albumId"] = nil
			maps.unmappedAlbums++
		}
	}
	raw, ok := data["productCategoryIds"].(string)
	if !ok {
		return
	}
	ids, ok := mappedCategoryIDs(raw, maps, assetType == "full_prompt", true)
	if !ok {
		data["productCategoryIds"] = "[]"
		maps.invalidLists++
		return
	}
	data["productCategoryIds"] = jsStringArray(ids)
}

func remapBackupSubcategory(data map[string]any, maps *backupMaps) {
	value, _ := data["productSubcategory"].(string)
	if value == "" {
		return
	}
	if builtinPromptSubcategory(value) {
		parent := maps.categoryMap["digital_3c"]
		if parent != "" && parent != "digital_3c" {
			mapped := maps.categoryMap["prompt_subcategory:digital_3c:"+value]
			if mapped == "" {
				data["productSubcategory"] = nil
			} else {
				data["productSubcategory"] = mapped
			}
		}
		return
	}
	if !strings.HasPrefix(value, "prompt_subcategory:") {
		return
	}
	if mapped := maps.categoryMap[value]; mapped != "" {
		data["productSubcategory"] = mapped
		return
	}
	if _, ok := maps.valid[value]; !ok {
		data["productSubcategory"] = nil
	}
}

func mappedCategoryIDs(raw string, maps *backupMaps, preserveSemantic, strict bool) ([]string, bool) {
	var parsed any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return []string{}, !strict
	}
	list, ok := parsed.([]any)
	if !ok {
		return []string{}, !strict
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range list {
		id, ok := item.(string)
		if !ok {
			if strict {
				return nil, false
			}
			continue
		}
		mapped := lookupBackupCategory(id, maps, strict)
		if mapped == "" && preserveSemantic && semanticPromptCategory(id) {
			mapped = id
		}
		if mapped == "" {
			continue
		}
		if _, exists := seen[mapped]; exists {
			continue
		}
		seen[mapped] = struct{}{}
		ids = append(ids, mapped)
	}
	return ids, true
}

func lookupBackupCategory(id string, maps *backupMaps, unresolved bool) string {
	if mapped := maps.categoryMap[id]; mapped != "" {
		return mapped
	}
	if _, ok := maps.valid[id]; ok {
		return id
	}
	if unresolved {
		maps.unresolved[id] = struct{}{}
	}
	return ""
}

func mapBackupCategory(id string, maps *backupMaps) string {
	return lookupBackupCategory(id, maps, true)
}

func canonicalStringList(value any, maps *backupMaps) string {
	if value == nil {
		return "[]"
	}
	text, ok := value.(string)
	if !ok {
		maps.invalidMeta++
		return "[]"
	}
	parsed, ok := parseStringList(text)
	if !ok {
		maps.invalidMeta++
		return "[]"
	}
	return jsStringArray(parsed)
}

func sourceImageCount(raw any) int {
	text, _ := raw.(string)
	var parsed any
	if json.Unmarshal([]byte(text), &parsed) != nil {
		return 0
	}
	list, ok := parsed.([]any)
	if !ok {
		return 0
	}
	count := 0
	for _, item := range list {
		value, ok := item.(string)
		if ok && strings.TrimSpace(value) != "" {
			count++
		}
	}
	return count
}

func categoriesByName(rows []importedCategory, name, parentID string) []importedCategory {
	matched := []importedCategory{}
	for _, row := range rows {
		if row.name == name && row.parentID == parentID {
			matched = append(matched, row)
		}
	}
	return matched
}

func findMatchingCategory(byID importedCategory, hasID bool, sameName []importedCategory, wanted importedCategory, ignoreArchived bool) (importedCategory, bool) {
	if hasID && categoryMatches(byID, wanted, ignoreArchived) {
		return byID, true
	}
	for _, row := range sameName {
		if categoryMatches(row, wanted, ignoreArchived) {
			return row, true
		}
	}
	return importedCategory{}, false
}

func categoryMatches(row, wanted importedCategory, ignoreArchived bool) bool {
	if row.name != wanted.name || row.parentID != wanted.parentID {
		return false
	}
	if !ignoreArchived && row.archived != wanted.archived {
		return false
	}
	return stringListMatches(row.aliases, wanted.aliases) && stringListMatches(row.keywords, wanted.keywords) && stringListMatches(row.anatomy, wanted.anatomy)
}

func stringListMatches(raw, expected string) bool {
	left, leftOK := parseStringList(raw)
	right, rightOK := parseStringList(expected)
	if !leftOK || !rightOK || len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func parseStringList(raw string) ([]string, bool) {
	var parsed any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil, false
	}
	list, ok := parsed.([]any)
	if !ok {
		return nil, false
	}
	values := make([]string, len(list))
	for index, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		values[index] = text
	}
	return values, true
}

func semanticPromptCategory(id string) bool {
	switch id {
	case "jewelry", "digital", "digital_3c", "phone", "手机数码", "apparel", "bag", "shoes", "beauty", "eyewear", "hat_accessory", "universal", "all":
		return true
	default:
		return false
	}
}

func builtinPromptSubcategory(value string) bool {
	switch value {
	case "phone", "case", "earphone", "tablet":
		return true
	default:
		return false
	}
}

func backupNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil && !math.IsNaN(parsed) && !math.IsInf(parsed, 0)
	case float64:
		return typed, !math.IsNaN(typed) && !math.IsInf(typed, 0)
	case int:
		return float64(typed), true
	default:
		return 0, false
	}
}
