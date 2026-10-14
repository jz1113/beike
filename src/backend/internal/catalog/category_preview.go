package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"encoding/json"
	"strings"
)

var categoryParentIDs = map[string]struct{}{
	"jewelry": {}, "digital_3c": {}, "apparel": {}, "bag": {},
	"shoes": {}, "beauty": {}, "eyewear": {}, "universal": {},
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
