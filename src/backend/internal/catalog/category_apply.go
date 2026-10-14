package catalog

import (
	"encoding/json"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database"
)

func parseCategoryApply(raw []byte) ([]database.CategoryApplyItem, bool) {
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
	items := make([]database.CategoryApplyItem, 0, len(list))
	for _, rawItem := range list {
		item, ok := parseCategoryApplyItem(rawItem)
		if !ok {
			return nil, false
		}
		items = append(items, item)
	}
	return items, true
}

func parseCategoryApplyItem(raw any) (database.CategoryApplyItem, bool) {
	object, ok := raw.(map[string]any)
	if !ok {
		return database.CategoryApplyItem{}, false
	}
	id, ok := requiredString(object, "id")
	if !ok {
		return database.CategoryApplyItem{}, false
	}
	parent, ok := requiredString(object, "parentId")
	if !ok {
		return database.CategoryApplyItem{}, false
	}
	label, ok := requiredString(object, "label")
	if !ok {
		return database.CategoryApplyItem{}, false
	}
	keywords, ok := optionalStringList(object, "keywords")
	if !ok {
		return database.CategoryApplyItem{}, false
	}
	anatomy := ""
	if value, exists := object["anatomy"]; exists {
		anatomy, ok = value.(string)
		if !ok {
			return database.CategoryApplyItem{}, false
		}
	}
	return database.CategoryApplyItem{ID: id, ParentID: parent, Label: label, Keywords: keywords, Anatomy: anatomy}, true
}
