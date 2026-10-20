package catalog

import (
	"encoding/json"

	"beike.local/cloud/src/backend/internal/platform/media"
)

func productDetailObject(raw string) map[string]any {
	var value any
	if json.Unmarshal([]byte(raw), &value) != nil {
		return nil
	}
	if object, ok := value.(map[string]any); ok {
		return object
	}
	if list, ok := value.([]any); ok {
		return map[string]any{"main": list}
	}
	return nil
}

func detailImageList(value any) []string {
	result := []string{}
	switch list := value.(type) {
	case []string:
		return list
	case []any:
		for _, item := range list {
			if source, ok := item.(string); ok {
				result = append(result, source)
			}
		}
	}
	return result
}

func detailImageKey(source string) string {
	if image, ok := media.ParseProductImage(source); ok {
		return image.Key
	}
	return source
}

// Generic product saves often send a flattened main array. Preserve known group
// ownership and all omitted metadata instead of replacing the collected detail.
func mergeProductDetail(previous, incoming string) string {
	old, next := productDetailObject(previous), productDetailObject(incoming)
	if next == nil {
		if old != nil {
			return previous
		}
		return incoming
	}
	if old == nil {
		old = map[string]any{}
	}
	groups := []string{"main", "skus", "details"}
	ownership := map[string]string{}
	for _, group := range groups {
		for _, source := range detailImageList(old[group]) {
			key := detailImageKey(source)
			if ownership[key] == "" {
				ownership[key] = group
			}
		}
	}
	for key, value := range next {
		if key != "main" && key != "skus" && key != "details" {
			if value == nil {
				continue
			}
			if key == "variantMetadata" && ReadProductVariantMetadata(value) == nil {
				continue
			}
			old[key] = value
		}
	}
	for _, group := range groups {
		for _, source := range detailImageList(next[group]) {
			key := detailImageKey(source)
			owner := ownership[key]
			if owner == "" {
				owner = group
				ownership[key] = group
			}
			old[owner] = append(detailImageList(old[owner]), source)
		}
	}
	body, err := json.Marshal(old)
	if err != nil {
		return previous
	}
	cleaned, _ := cleanDetailURLs(string(body))
	result, _ := cleaned.(string)
	return result
}
