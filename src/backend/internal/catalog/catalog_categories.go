package catalog

import (
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
)

var categoryParentIDs = map[string]struct{}{
	"jewelry": {}, "digital_3c": {}, "apparel": {}, "bag": {},
	"shoes": {}, "beauty": {}, "eyewear": {}, "universal": {},
}

func Categories(cfg config.Config) http.Handler      { return categoriesHandler(cfg) }
func CategoryPreview(cfg config.Config) http.Handler { return categoryPreviewHandler(cfg) }
func CategoryApply(cfg config.Config) http.Handler   { return categoryApplyHandler(cfg) }
func Prompts(cfg config.Config) http.Handler         { return promptRecordsHandler(cfg) }
func CreatePrompts(cfg config.Config) http.Handler   { return promptRecordsCreateHandler(cfg) }
func DeletePrompts(cfg config.Config) http.Handler   { return promptRecordsDeleteHandler(cfg) }
func Styles(cfg config.Config) http.Handler          { return styleRecipesHandler(cfg) }
func CreateStyle(cfg config.Config) http.Handler     { return styleRecipesPostHandler(cfg) }
func UpdateStyle(cfg config.Config) http.Handler     { return styleRecipesPutHandler(cfg) }
func DeleteStyle(cfg config.Config) http.Handler     { return styleRecipesDeleteHandler(cfg) }
func ParseLink(cfg config.Config) http.Handler       { return parseLinkHandler(cfg) }
func ExtractStyle(cfg config.Config) http.Handler    { return extractStyleHandler(cfg) }
func Products(cfg config.Config) http.Handler        { return productsHandler(cfg) }
func CreateProduct(cfg config.Config) http.Handler   { return productsCreateHandler(cfg) }
func UpdateProduct(cfg config.Config) http.Handler   { return productsUpdateHandler(cfg) }
func DeleteProduct(cfg config.Config) http.Handler   { return productsDeleteHandler(cfg) }
func Collect(cfg config.Config) http.Handler         { return collectHandler(cfg) }

func categoriesHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		defer db.Close()
		categories, err := dbcatalog.ListServerSubCategories(r.Context(), db, httpx.WorkspaceFrom(r), filepath.Join(cfg.Root, "src/shared/data/defaultSubCategories.json"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "架构操作失败，请稍后重试。"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "categories": categories})
	}
}

func categoryPreviewHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			writeCategoryPreviewError(w)
			return
		}
		local, ok := parseCategoryPreview(body)
		if !ok {
			writeCategoryPreviewError(w)
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeCategoryPreviewError(w)
			return
		}
		defer db.Close()
		preview, err := dbcatalog.PreviewCategoryMigration(r.Context(), db, httpx.WorkspaceFrom(r), filepath.Join(cfg.Root, "src/shared/data/defaultSubCategories.json"), local)
		if err != nil {
			writeCategoryPreviewError(w)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "preview": preview})
	}
}

func categoryApplyHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			writeCategoryApplyError(w)
			return
		}
		items, ok := parseCategoryApply(body)
		if !ok {
			writeCategoryApplyError(w)
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeCategoryApplyError(w)
			return
		}
		defer db.Close()
		categories, err := dbcatalog.ApplyCategoryMigration(r.Context(), db, httpx.WorkspaceFrom(r), filepath.Join(cfg.Root, "src/shared/data/defaultSubCategories.json"), items)
		if err != nil {
			writeCategoryApplyError(w)
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "categories": categories})
	}
}

func writeCategoryApplyError(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false, "error": "类目迁移写入失败", "code": "bad_request",
	})
}

func writeCategoryPreviewError(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false, "error": "类目迁移预览参数不正确", "code": "bad_request",
	})
}

func parseCategoryApply(raw []byte) ([]dbcatalog.CategoryApplyItem, bool) {
	if strings.TrimSpace(string(raw)) == "" {
		return nil, false
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, false
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, false
	}
	list, ok := object["items"].([]any)
	if !ok || len(list) == 0 {
		return nil, false
	}
	items := make([]dbcatalog.CategoryApplyItem, 0, len(list))
	for _, rawItem := range list {
		item, ok := parseCategoryApplyItem(rawItem)
		if !ok {
			return nil, false
		}
		items = append(items, item)
	}
	return items, true
}

func parseCategoryApplyItem(raw any) (dbcatalog.CategoryApplyItem, bool) {
	object, ok := raw.(map[string]any)
	if !ok {
		return dbcatalog.CategoryApplyItem{}, false
	}
	id, ok := requiredString(object, "id")
	if !ok {
		return dbcatalog.CategoryApplyItem{}, false
	}
	parent, ok := requiredString(object, "parentId")
	if !ok {
		return dbcatalog.CategoryApplyItem{}, false
	}
	label, ok := requiredString(object, "label")
	if !ok {
		return dbcatalog.CategoryApplyItem{}, false
	}
	keywords, ok := optionalStringList(object, "keywords")
	if !ok {
		return dbcatalog.CategoryApplyItem{}, false
	}
	anatomy := ""
	if value, exists := object["anatomy"]; exists {
		anatomy, ok = value.(string)
		if !ok {
			return dbcatalog.CategoryApplyItem{}, false
		}
	}
	return dbcatalog.CategoryApplyItem{ID: id, ParentID: parent, Label: label, Keywords: keywords, Anatomy: anatomy}, true
}

func parseCategoryPreview(raw []byte) ([]dbcatalog.LocalCategoryReport, bool) {
	if strings.TrimSpace(string(raw)) == "" {
		return nil, true
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, true
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, false
	}
	local, exists := object["local"]
	if !exists {
		return nil, true
	}
	reports, ok := local.([]any)
	if !ok {
		return nil, false
	}
	parsed := make([]dbcatalog.LocalCategoryReport, 0, len(reports))
	for _, report := range reports {
		item, ok := parseLocalReport(report)
		if !ok {
			return nil, false
		}
		parsed = append(parsed, item)
	}
	return parsed, true
}

func parseLocalReport(raw any) (dbcatalog.LocalCategoryReport, bool) {
	object, ok := raw.(map[string]any)
	if !ok {
		return dbcatalog.LocalCategoryReport{}, false
	}
	parent, ok := object["parentId"].(string)
	if !ok {
		return dbcatalog.LocalCategoryReport{}, false
	}
	if _, known := categoryParentIDs[parent]; !known {
		return dbcatalog.LocalCategoryReport{}, false
	}
	categories := []dbcatalog.LocalCategory{}
	if value, exists := object["categories"]; exists {
		list, ok := value.([]any)
		if !ok {
			return dbcatalog.LocalCategoryReport{}, false
		}
		for _, item := range list {
			category, ok := parseLocalCategory(item)
			if !ok {
				return dbcatalog.LocalCategoryReport{}, false
			}
			categories = append(categories, category)
		}
	}
	return dbcatalog.LocalCategoryReport{ParentID: parent, Categories: categories}, true
}

func parseLocalCategory(raw any) (dbcatalog.LocalCategory, bool) {
	object, ok := raw.(map[string]any)
	if !ok {
		return dbcatalog.LocalCategory{}, false
	}
	id, ok := requiredString(object, "id")
	if !ok {
		return dbcatalog.LocalCategory{}, false
	}
	parent, ok := requiredString(object, "parentId")
	if !ok {
		return dbcatalog.LocalCategory{}, false
	}
	label, ok := requiredString(object, "label")
	if !ok {
		return dbcatalog.LocalCategory{}, false
	}
	shortLabel := ""
	if value, exists := object["shortLabel"]; exists {
		shortLabel, ok = value.(string)
		if !ok {
			return dbcatalog.LocalCategory{}, false
		}
	}
	if value, exists := object["isCustom"]; exists {
		if _, ok := value.(bool); !ok {
			return dbcatalog.LocalCategory{}, false
		}
	}
	keywords, ok := optionalStringList(object, "keywords")
	if !ok {
		return dbcatalog.LocalCategory{}, false
	}
	var anatomy *string
	if value, exists := object["anatomy"]; exists {
		text, ok := value.(string)
		if !ok {
			return dbcatalog.LocalCategory{}, false
		}
		anatomy = &text
	}
	return dbcatalog.LocalCategory{
		ID: id, ParentID: parent, Label: label, ShortLabel: shortLabel, Keywords: keywords, Anatomy: anatomy,
	}, true
}

func requiredString(object map[string]any, key string) (string, bool) {
	value, exists := object[key]
	if !exists {
		return "", false
	}
	text, ok := value.(string)
	return text, ok
}

func optionalStringList(object map[string]any, key string) ([]string, bool) {
	value, exists := object[key]
	if !exists {
		return []string{}, true
	}
	list, ok := value.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		out = append(out, text)
	}
	return out, true
}
