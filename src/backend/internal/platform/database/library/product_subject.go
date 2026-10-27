package library

import "strings"

// ProductSubjectText excludes promotional gifts when choosing a creative skill.
func ProductSubjectText(title string) string {
	return giftedAccessoryPattern.ReplaceAllString(title, "")
}

func ProductSubcategory(title string, props map[string]string) string {
	title = strings.ToLower(ProductSubjectText(title))
	if isPhoneProduct(title) {
		return "phone"
	}
	if kind := digitalKind(title); kind != "" {
		return kind
	}
	for _, key := range []string{"商品类目", "品类", "category", "分类"} {
		if kind := digitalKind(strings.ToLower(props[key])); kind != "" {
			return kind
		}
	}
	return ""
}
