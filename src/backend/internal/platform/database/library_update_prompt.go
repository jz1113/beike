package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
)

func prepareFullPrompt(ctx context.Context, tx *sql.Tx, workspace, id string, data map[string]any) error {
	var owner string
	var album sql.NullString
	var categories string
	err := tx.QueryRowContext(ctx, `
		SELECT "workspaceId", "albumId", "productCategoryIds" FROM "FullPromptAsset"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, id, workspace, officialWorkspace).Scan(&owner, &album, &categories)
	if err == sql.ErrNoRows {
		return LibraryUpdateError{Message: "图组不存在"}
	}
	if err != nil {
		return err
	}
	if owner != workspace {
		return LibraryUpdateError{Message: "官方图组不可修改"}
	}
	if value, ok := data["albumId"]; ok && !sameOptionalText(album, value) {
		return LibraryUpdateError{Message: "请通过图集管理调整图组归属"}
	}
	if raw, ok := data["productCategoryIds"]; ok {
		return applyPromptCategory(ctx, tx, workspace, album, categories, raw, data)
	}
	if value, ok := data["productSubcategory"]; ok && value != nil {
		return applyPromptSubcategory(ctx, tx, workspace, album, categories, value, data)
	}
	return nil
}

func applyPromptCategory(ctx context.Context, tx *sql.Tx, workspace string, album sql.NullString, categories string, raw any, data map[string]any) error {
	text, ok := raw.(string)
	if !ok {
		return LibraryUpdateError{Message: "商品大类必须为 JSON 数组"}
	}
	categoryID, err := oneMajorCategory(text)
	if err != nil {
		return err
	}
	resolved, err := resolveMajorCategory(ctx, tx, workspace, categoryID)
	if err != nil {
		return asLibraryUpdateError(err)
	}
	if value, exists := data["productSubcategory"]; exists {
		normalized, err := normalizePromptSubcategory(ctx, tx, workspace, resolved, value)
		if err != nil {
			return err
		}
		data["productSubcategory"] = normalized
	}
	if album.Valid {
		if err := assignAlbumCategory(ctx, tx, workspace, album.String, resolved); err != nil {
			return asLibraryUpdateError(err)
		}
	}
	data["productCategoryIds"] = majorCategoryJSON(resolved)
	changed, err := categorySelectionChanged(categories, resolved)
	if err != nil {
		return err
	}
	if _, exists := data["productSubcategory"]; !exists && changed {
		data["productSubcategory"] = nil
	}
	return nil
}

func applyPromptSubcategory(ctx context.Context, tx *sql.Tx, workspace string, album sql.NullString, categories string, value any, data map[string]any) error {
	text, ok := value.(string)
	if !ok {
		return LibraryUpdateError{Message: "商品二级类目无效"}
	}
	categoryID, found, err := firstStoredCategory(categories)
	if err != nil {
		return err
	}
	var resolved *string
	if found {
		resolved = &categoryID
	} else {
		inferred, ok := inferredPromptCategory(text)
		if !ok {
			parent, err := folderParent(ctx, tx, workspace, text)
			if err != nil {
				return err
			}
			inferred = parent
		}
		if inferred == "" {
			return LibraryUpdateError{Message: "请先选择商品大类"}
		}
		resolved, err = resolveMajorCategory(ctx, tx, workspace, &inferred)
		if err != nil {
			return asLibraryUpdateError(err)
		}
		if album.Valid {
			if err := assignAlbumCategory(ctx, tx, workspace, album.String, resolved); err != nil {
				return asLibraryUpdateError(err)
			}
		}
		data["productCategoryIds"] = majorCategoryJSON(resolved)
	}
	normalized, err := normalizePromptSubcategory(ctx, tx, workspace, resolved, value)
	if err != nil {
		return err
	}
	data["productSubcategory"] = normalized
	return nil
}

func inferredPromptCategory(value string) (string, bool) {
	if builtinSubcategory(value) {
		return "digital_3c", true
	}
	return "", false
}

func folderParent(ctx context.Context, tx *sql.Tx, workspace, id string) (string, error) {
	if !strings.HasPrefix(id, promptSubcategoryPrefix) {
		return "", nil
	}
	var parent sql.NullString
	err := tx.QueryRowContext(ctx, `
		SELECT "parentId" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, id, workspace, officialWorkspace).Scan(&parent)
	if err == sql.ErrNoRows || (err == nil && (!parent.Valid || parent.String == "")) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return parent.String, nil
}

func normalizePromptSubcategory(ctx context.Context, tx *sql.Tx, workspace string, categoryID *string, value any) (any, error) {
	if value == nil {
		return nil, nil
	}
	text, ok := value.(string)
	if !ok {
		return nil, LibraryUpdateError{Message: "商品二级类目无效"}
	}
	if builtinSubcategory(text) {
		if categoryID == nil || *categoryID != "digital_3c" {
			return nil, LibraryUpdateError{Message: "数码细分只能用于手机数码"}
		}
		return text, builtinFolderActive(ctx, tx, workspace, text)
	}
	if !strings.HasPrefix(text, promptSubcategoryPrefix) {
		return nil, LibraryUpdateError{Message: "商品二级类目无效"}
	}
	var parent sql.NullString
	var archived int
	var owner string
	err := tx.QueryRowContext(ctx, `
		SELECT "parentId", "isArchived", "workspaceId" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, text, workspace, officialWorkspace).Scan(&parent, &archived, &owner)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == sql.ErrNoRows || archived != 0 || owner != workspace || !sameParent(parent, categoryID) {
		return nil, LibraryUpdateError{Message: "细分文件夹不属于当前商品大类"}
	}
	if categoryID != nil && *categoryID == "digital_3c" {
		if builtin := builtinFromFolder(text); builtin != "" {
			return builtin, nil
		}
	}
	return text, nil
}

func builtinFolderActive(ctx context.Context, tx *sql.Tx, workspace, kind string) error {
	var archived int
	err := tx.QueryRowContext(ctx, `
		SELECT "isArchived" FROM "AssetProductCategory"
		WHERE "id" = ? AND "workspaceId" IN (?, ?)`, builtinFolderID(kind), workspace, officialWorkspace).Scan(&archived)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if archived != 0 {
		return LibraryUpdateError{Message: "商品细分文件夹已删除"}
	}
	return nil
}

func oneMajorCategory(raw string) (*string, error) {
	var parsed any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil, LibraryUpdateError{Message: "商品大类必须为 JSON 数组"}
	}
	list, ok := parsed.([]any)
	if !ok || len(list) > 1 {
		return nil, LibraryUpdateError{Message: "图组只能选择一个商品大类"}
	}
	if len(list) == 0 {
		return nil, nil
	}
	text, ok := list[0].(string)
	if !ok || strings.TrimSpace(text) == "" {
		return nil, LibraryUpdateError{Message: "图组只能选择一个商品大类"}
	}
	return &text, nil
}

func majorCategoryJSON(id *string) string {
	if id == nil {
		return categoryJSON(nil)
	}
	return categoryJSON([]string{*id})
}

func categorySelectionChanged(stored string, next *string) (bool, error) {
	if strings.TrimSpace(stored) == "" {
		stored = "[]"
	}
	var parsed any
	if json.Unmarshal([]byte(stored), &parsed) != nil {
		return false, errors.New("stored product categories")
	}
	list, ok := parsed.([]any)
	var current any
	if ok && len(list) > 0 {
		current = list[0]
	}
	if next == nil {
		if !ok || len(list) == 0 {
			return true, nil
		}
		return current != nil, nil
	}
	text, isString := current.(string)
	return !isString || text != *next, nil
}

func firstStoredCategory(stored string) (string, bool, error) {
	if strings.TrimSpace(stored) == "" {
		return "", false, nil
	}
	var parsed any
	if json.Unmarshal([]byte(stored), &parsed) != nil {
		return "", false, errors.New("stored product categories")
	}
	list, ok := parsed.([]any)
	if !ok || len(list) == 0 {
		return "", false, nil
	}
	text, ok := list[0].(string)
	if !ok || text == "" {
		return "", false, nil
	}
	return text, true, nil
}

func sameOptionalText(current sql.NullString, value any) bool {
	if value == nil {
		return !current.Valid
	}
	text, ok := value.(string)
	return ok && current.Valid && current.String == text
}

func sameParent(parent sql.NullString, categoryID *string) bool {
	if !parent.Valid {
		return categoryID == nil
	}
	return categoryID != nil && parent.String == *categoryID
}

func builtinFromFolder(id string) string {
	const prefix = "prompt_subcategory:digital_3c:"
	kind := strings.TrimPrefix(id, prefix)
	if kind == id || !builtinSubcategory(kind) {
		return ""
	}
	return kind
}

func asLibraryUpdateError(err error) error {
	if err == nil {
		return nil
	}
	var client LibraryUpdateError
	if errors.As(err, &client) {
		return client
	}
	var text errText
	if errors.As(err, &text) {
		return LibraryUpdateError{Message: text.Error()}
	}
	return err
}
