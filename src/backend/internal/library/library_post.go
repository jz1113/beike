package library

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func libraryPostHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20+1))
		if err != nil || len(body) > 32<<20 {
			writeLibraryMutationError(w, "分类操作失败")
			return
		}
		switch libraryAction(body) {
		case "reorder-product-categories":
			saveLibraryReorder(cfg, w, r, body)
		case "save-product-category":
			saveLibraryCategory(cfg, w, r, body)
		case "classify-albums":
			classifyLibraryAlbums(cfg, w, r, body)
		case "classify-assets":
			classifyLibraryAssets(cfg, w, r, body)
		case "move-prompt-groups":
			moveLibraryPromptGroups(cfg, w, r, body)
		case "archive-prompt-folders":
			archiveLibraryFolders(cfg, w, r, body)
		case "save-prompt-folder-rules":
			saveLibraryFolderRules(cfg, w, r, body)
		case "import-prompt-folder-rules":
			importLibraryFolderRules(cfg, w, r, body)
		case "save-prompt-subcategory":
			saveLibrarySubcategory(cfg, w, r, body)
		default:
			if !serveLibraryCreate(cfg, w, r, body) {
				writeLibraryMutationError(w, "分类操作失败")
			}
		}
	}
}

func libraryAction(body []byte) string {
	var payload any
	if json.Unmarshal(body, &payload) != nil {
		return ""
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return ""
	}
	action, _ := object["action"].(string)
	return action
}

func saveLibraryReorder(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	ids, parentID, message := parseCategoryReorder(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	organization, err := database.ReorderProductCategories(r.Context(), db, httpx.WorkspaceFrom(r), parentID, ids)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	writeLibraryOrganization(w, organization)
}

func saveLibraryCategory(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	input, message := parseCategorySave(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	organization, err := database.SaveProductCategory(r.Context(), db, httpx.WorkspaceFrom(r), input)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	writeLibraryOrganization(w, organization)
}

func writeLibraryOrganization(w http.ResponseWriter, organization database.AssetOrganization) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "categories": organization.Categories, "albums": organization.Albums,
	})
}

func classifyLibraryAlbums(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	ids, categoryID, message := parseAlbumClassify(body)
	if message != "" {
		writeLibraryMutationError(w, message)
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeLibraryMutationError(w, "分类操作失败")
		return
	}
	defer db.Close()
	organization, err := database.ClassifyAlbums(r.Context(), db, httpx.WorkspaceFrom(r), ids, categoryID)
	if err != nil {
		writeLibraryMutationError(w, err.Error())
		return
	}
	writeLibraryOrganization(w, organization)
}

func parseAlbumClassify(body []byte) ([]string, *string, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return nil, nil, "分类操作失败"
	}
	ids, err := albumIDs(object["albumIds"])
	if err != nil {
		return nil, nil, err.Error()
	}
	categoryID, message := albumMajorCategory(object["productCategoryId"], hasKey(object, "productCategoryId"))
	if message != "" {
		return nil, nil, message
	}
	return ids, categoryID, ""
}

func parseAssetClassify(body []byte) (string, []string, []string, bool, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return "", nil, nil, false, "分类操作失败"
	}
	assetType, _ := object["assetType"].(string)
	if !database.ClassifiableAssetType(assetType) {
		return "", nil, nil, false, "完整提示词请按图集调整归属"
	}
	ids, err := assetIDs(object["ids"])
	if err != nil {
		return "", nil, nil, false, err.Error()
	}
	categories, message := assetCategoryIDs(object["productCategoryIds"], hasKey(object, "productCategoryIds"))
	if message != "" {
		return "", nil, nil, false, message
	}
	universal, ok := assetUniversal(object["isUniversal"], hasKey(object, "isUniversal"))
	if !ok {
		return "", nil, nil, false, "通用标记必须为布尔值"
	}
	return assetType, ids, categories, universal, ""
}

func assetIDs(value any) ([]string, error) {
	list, ok := value.([]any)
	if !ok || len(list) == 0 {
		return nil, errString("请选择素材")
	}
	ids := make([]string, 0, len(list))
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, errString("请选择素材")
		}
		ids = append(ids, text)
	}
	return ids, nil
}

func assetCategoryIDs(value any, exists bool) ([]string, string) {
	if !exists || categoryValueEmpty(value) {
		return []string{}, ""
	}
	list, ok := value.([]any)
	if !ok {
		return nil, "商品品类必须为 JSON 数组"
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, "商品品类必须为 JSON 数组"
		}
		if text == "" {
			continue
		}
		if _, exists := seen[text]; exists {
			continue
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids, ""
}

func categoryValueEmpty(value any) bool {
	if value == nil {
		return true
	}
	switch typed := value.(type) {
	case string:
		return typed == ""
	case bool:
		return !typed
	case float64:
		return typed == 0
	default:
		return false
	}
}

func assetUniversal(value any, exists bool) (bool, bool) {
	if !exists || value == nil && !exists {
		return false, true
	}
	if !exists {
		return false, true
	}
	typed, ok := value.(bool)
	if !ok {
		return false, false
	}
	return typed, true
}

func albumIDs(value any) ([]string, error) {
	list, ok := value.([]any)
	if !ok || len(list) == 0 {
		return nil, errString("请选择图集")
	}
	ids := make([]string, 0, len(list))
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, errString("请选择图集")
		}
		ids = append(ids, text)
	}
	return ids, nil
}

func albumMajorCategory(value any, exists bool) (*string, string) {
	if !exists || value == nil {
		return nil, ""
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return nil, ""
		}
		if strings.TrimSpace(typed) == "" {
			return nil, "图组只能选择一个商品大类"
		}
		return &typed, ""
	case bool:
		if !typed {
			return nil, ""
		}
	case float64:
		if typed == 0 {
			return nil, ""
		}
	}
	return nil, "图组只能选择一个商品大类"
}

func parseCategoryReorder(body []byte) ([]string, *string, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return nil, nil, "分类操作失败"
	}
	parentID, ok := reorderParentID(object["parentId"], hasKey(object, "parentId"))
	if !ok {
		return nil, nil, "分类操作失败"
	}
	ids, err := reorderIDs(object["ids"])
	if err != nil {
		return nil, nil, err.Error()
	}
	return ids, parentID, ""
}

func parseCategorySave(body []byte) (database.CategorySave, string) {
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return database.CategorySave{}, "分类操作失败"
	}
	name, _ := object["name"].(string)
	id, ok := optionalCategoryID(object["id"], hasKey(object, "id"))
	if !ok {
		return database.CategorySave{}, "分类操作失败"
	}
	parentID, ok := reorderParentID(object["parentId"], hasKey(object, "parentId"))
	if !ok {
		return database.CategorySave{}, "分类操作失败"
	}
	return database.CategorySave{ID: id, Name: name, ParentID: parentID}, ""
}

func optionalCategoryID(value any, exists bool) (*string, bool) {
	if !exists || value == nil {
		return nil, true
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return nil, true
		}
		return &typed, true
	case bool:
		if !typed {
			return nil, true
		}
	case float64:
		if typed == 0 {
			return nil, true
		}
	}
	return nil, false
}

func hasKey(object map[string]any, key string) bool {
	_, ok := object[key]
	return ok
}

func reorderParentID(value any, exists bool) (*string, bool) {
	if !exists || value == nil {
		return nil, true
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return nil, true
		}
		return &typed, true
	case bool:
		if !typed {
			return nil, true
		}
	case float64:
		if typed == 0 {
			return nil, true
		}
	}
	return nil, false
}

func reorderIDs(value any) ([]string, error) {
	list, ok := value.([]any)
	if !ok {
		return nil, errReorderIDs
	}
	seen := map[string]struct{}{}
	ids := make([]string, 0, len(list))
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, errReorderIDs
		}
		if _, exists := seen[text]; exists {
			return nil, errReorderIDs
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids, nil
}

var errReorderIDs = errString("排序数据无效")

type errString string

func (err errString) Error() string { return string(err) }

func writeLibraryMutationError(w http.ResponseWriter, message string) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
}
