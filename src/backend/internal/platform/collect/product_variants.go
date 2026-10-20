package collect

import (
	"encoding/json"
	"sort"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database/catalog"
)

type variantLabel struct{ label, color string }

// Only platform property indexes, SKU associations and explicitly selected fields
// are evidence. The compatibility product.skuId alias is never read here.
func extractProductVariants(item map[string]any, input productInput, images []string) *catalog.ProductVariantMetadata {
	labels := map[string]variantLabel{}
	readPropertyLabels(item["props_list"], labels)
	readPropertyNames(firstText(item, "properties_name", "props_name"), labels)
	skuRows := variantRows(item["skus"], "sku", "skus", "items", "list")
	for _, row := range skuRows {
		readPropertyNames(firstText(row, "properties_name", "props_name"), labels)
	}
	variants := []catalog.ProductColorVariant{}
	positions := map[string]int{}
	ensure := func(key string, evidence variantLabel) int {
		if index, exists := positions[key]; exists {
			if variants[index].Label == "未知" && evidence.label != "" {
				variants[index].Label = evidence.label
			}
			if variants[index].Color == "" {
				variants[index].Color = evidence.color
			}
			return index
		}
		label := evidence.label
		if label == "" {
			label = "未知"
		}
		positions[key] = len(variants)
		variants = append(variants, catalog.ProductColorVariant{ID: key, Label: label, Color: evidence.color, SKUIDs: []string{}, ImageURLs: []string{}})
		return len(variants) - 1
	}
	for _, field := range []string{"prop_imgs", "props_img"} {
		walkVariantImages(item[field], "", func(key string, row map[string]any, urls []string) {
			if key == "" {
				return
			}
			evidence := labels[key]
			if label := firstText(row, "label", "color_name", "color", "value", "value_name", "name"); label != "" {
				evidence.label = label
			}
			if color := firstText(row, "color_name", "color"); color != "" {
				evidence.color = color
			}
			index := ensure(key, evidence)
			variants[index].ImageURLs = uniqueStrings(append(variants[index].ImageURLs, urls...))
		})
	}
	for _, row := range skuRows {
		skuID := firstText(row, "sku_id", "skuId", "skuid")
		propertyKeys := skuPropertyKeys(row)
		matched := []int{}
		for _, key := range propertyKeys {
			evidence := labels[key]
			_, exists := positions[key]
			// Non-image properties (e.g. size) do not become color variants unless
			// the upstream explicitly labels them as a color property.
			if !exists && evidence.color == "" {
				continue
			}
			matched = append(matched, ensure(key, evidence))
		}
		if len(matched) == 0 {
			color := firstText(row, "color_name", "color")
			label := firstText(row, "label", "sku_name")
			if color != "" {
				label = color
			}
			if label != "" && skuID != "" {
				matched = append(matched, ensure("sku:"+skuID, variantLabel{label, color}))
			} else if skuID != "" && len(extractURLs(row, false)) > 0 {
				matched = append(matched, ensure("sku:"+skuID, variantLabel{}))
			}
		}
		for _, index := range matched {
			if skuID != "" {
				variants[index].SKUIDs = uniqueStrings(append(variants[index].SKUIDs, skuID))
			}
			variants[index].ImageURLs = uniqueStrings(append(variants[index].ImageURLs, extractURLs(row, false)...))
		}
	}
	requested := input.requestedSKUID
	if requested == "" && input.platform == "jd" {
		requested = input.itemID
	}
	result := &catalog.ProductVariantMetadata{Version: 1, Variants: variants, RequestedSKUID: requested}
	selectedSKU := firstText(item, "selected_sku_id", "selectedSkuId", "current_sku_id", "currentSkuId")
	if selectedSKU == "" {
		selectedSKU = requested
	}
	matches := []string{}
	for _, variant := range variants {
		for _, skuID := range variant.SKUIDs {
			if skuID == selectedSKU && selectedSKU != "" {
				matches = append(matches, variant.ID)
				break
			}
		}
	}
	if len(matches) == 1 {
		result.SelectedVariantID = matches[0]
	}
	if explicit := firstText(item, "selectedVariantId", "selected_variant_id"); explicit != "" {
		if _, exists := positions[explicit]; exists {
			result.SelectedVariantID = explicit
		}
	}
	return catalog.AlignProductVariantImages(result, images)
}

func selectRequestedVariant(metadata *catalog.ProductVariantMetadata, input productInput) *catalog.ProductVariantMetadata {
	if metadata == nil {
		return nil
	}
	requested := input.requestedSKUID
	if requested == "" && input.platform == "jd" {
		requested = input.itemID
	}
	if requested == metadata.RequestedSKUID {
		return metadata
	}
	result := *metadata
	result.RequestedSKUID, result.SelectedVariantID = requested, ""
	matches := []string{}
	for _, variant := range result.Variants {
		for _, skuID := range variant.SKUIDs {
			if requested != "" && skuID == requested {
				matches = append(matches, variant.ID)
				break
			}
		}
	}
	if len(matches) == 1 {
		result.SelectedVariantID = matches[0]
	}
	return &result
}

func decodedVariantValue(value any) any {
	if text, ok := value.(string); ok && (strings.HasPrefix(strings.TrimSpace(text), "{") || strings.HasPrefix(strings.TrimSpace(text), "[")) {
		var parsed any
		if json.Unmarshal([]byte(text), &parsed) == nil {
			return parsed
		}
	}
	return value
}

func sortedVariantKeys(object map[string]any) []string {
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func variantRows(value any, containers ...string) []map[string]any {
	switch source := decodedVariantValue(value).(type) {
	case []any:
		result := []map[string]any{}
		for _, row := range source {
			result = append(result, variantRows(row, containers...)...)
		}
		return result
	case map[string]any:
		for _, key := range containers {
			if nested, exists := source[key]; exists {
				return variantRows(nested, containers...)
			}
		}
		if firstText(source, "sku_id", "skuId", "skuid", "properties", "properties_name") != "" {
			return []map[string]any{source}
		}
		result := []map[string]any{}
		for _, key := range sortedVariantKeys(source) {
			if imageIndexKey.MatchString(key) {
				result = append(result, variantRows(source[key], containers...)...)
			}
		}
		return result
	}
	return nil
}

func colorProperty(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	return strings.Contains(name, "颜色") || strings.Contains(name, "色系") || name == "color" || name == "colour" || name == "color classification"
}

func readPropertyLabels(value any, labels map[string]variantLabel) {
	if source, ok := decodedVariantValue(value).(map[string]any); ok {
		for _, key := range sortedVariantKeys(source) {
			if !imageIndexKey.MatchString(key) {
				continue
			}
			text, ok := source[key].(string)
			if !ok {
				continue
			}
			parts := strings.SplitN(text, ":", 2)
			evidence := variantLabel{label: strings.TrimSpace(text)}
			if len(parts) == 2 {
				evidence.label = strings.TrimSpace(parts[1])
				if colorProperty(parts[0]) {
					evidence.color = evidence.label
				}
			}
			labels[key] = evidence
		}
	}
}

func readPropertyNames(value string, labels map[string]variantLabel) {
	for _, token := range strings.Split(value, ";") {
		parts := strings.SplitN(strings.TrimSpace(token), ":", 4)
		if len(parts) != 4 {
			continue
		}
		key := parts[0] + ":" + parts[1]
		if !imageIndexKey.MatchString(key) {
			continue
		}
		evidence := variantLabel{label: strings.TrimSpace(parts[3])}
		if colorProperty(parts[2]) {
			evidence.color = evidence.label
		}
		labels[key] = evidence
	}
}

func skuPropertyKeys(row map[string]any) []string {
	keys := []string{}
	for _, field := range []string{"properties", "props", "properties_name", "props_name"} {
		value, ok := row[field].(string)
		if !ok {
			continue
		}
		for _, token := range strings.Split(value, ";") {
			parts := strings.Split(strings.TrimSpace(token), ":")
			if len(parts) >= 2 {
				key := parts[0] + ":" + parts[1]
				if imageIndexKey.MatchString(key) {
					keys = append(keys, key)
				}
			}
		}
	}
	return uniqueStrings(keys)
}

func walkVariantImages(value any, key string, visit func(string, map[string]any, []string)) {
	switch source := decodedVariantValue(value).(type) {
	case []any:
		for _, row := range source {
			walkVariantImages(row, key, visit)
		}
	case map[string]any:
		explicit := firstText(source, "properties", "property", "prop_id")
		if imageIndexKey.MatchString(explicit) {
			key = explicit
		}
		urls := extractURLs(source, false)
		if key != "" && len(urls) > 0 {
			visit(key, source, urls)
			return
		}
		for _, nestedKey := range sortedVariantKeys(source) {
			switch nestedKey {
			case "prop_img", "prop_imgs", "props_img", "list", "items":
				walkVariantImages(source[nestedKey], key, visit)
			default:
				if imageIndexKey.MatchString(nestedKey) {
					walkVariantImages(source[nestedKey], nestedKey, visit)
				}
			}
		}
	default:
		if urls := extractURLs(source, false); key != "" && len(urls) > 0 {
			visit(key, nil, urls)
		}
	}
}
