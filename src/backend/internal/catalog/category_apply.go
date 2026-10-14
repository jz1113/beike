package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"strings"
)

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
