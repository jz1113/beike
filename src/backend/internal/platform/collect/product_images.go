package collect

import (
	"encoding/json"
	"html"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/database/catalog"
	"beike.local/cloud/src/backend/internal/platform/media"
	xhtml "golang.org/x/net/html"
)

var imageIndexKey = regexp.MustCompile(`^\d+(?::\d+)*$`)

// Only descend through image fields, documented containers and numeric property
// maps. Never walk arbitrary sku/shop/product metadata looking for URLs.
func extractURLs(source any, allowHTML bool) []string {
	result := []string{}
	var walk func(any)
	walk = func(source any) {
		switch value := source.(type) {
		case string:
			text := strings.TrimSpace(value)
			if text == "" {
				return
			}
			if strings.HasPrefix(text, "[") || strings.HasPrefix(text, "{") || strings.HasPrefix(text, `"`) {
				var nested any
				if json.Unmarshal([]byte(text), &nested) == nil {
					walk(nested)
					return
				}
			}
			if strings.Contains(text, "<") || strings.Contains(strings.ToLower(text), "&lt;") {
				if allowHTML {
					result = append(result, htmlProductImages(text)...)
				}
				return
			}
			if strings.HasPrefix(text, "//") || strings.HasPrefix(text, "jfs/") || strings.HasPrefix(strings.ToLower(text), "http://") || strings.HasPrefix(strings.ToLower(text), "https://") {
				result = append(result, text)
			}
		case []string:
			for _, item := range value {
				walk(item)
			}
		case []any:
			for _, item := range value {
				walk(item)
			}
		case map[string]any:
			keys := make([]string, 0, len(value))
			for key := range value {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				switch strings.ToLower(key) {
				case "url", "pic", "pic_url", "picurl", "image", "image_url", "imageurl", "img", "img_url", "src", "original", "original_url", "item_img", "item_imgs", "prop_img", "prop_imgs", "props_img", "sku", "skus", "sku_img", "sku_image", "sku_image_url", "desc_img", "desc", "images", "imgs", "list", "items":
					walk(value[key])
				default:
					if imageIndexKey.MatchString(key) {
						walk(value[key])
					}
				}
			}
		}
	}
	walk(source)
	return uniqueStrings(result)
}

func htmlProductImages(source string) []string {
	// Token attributes are entity-decoded by the tokenizer. Decode the entire
	// document only when the tags themselves are escaped, to avoid double-decoding
	// query bytes in ordinary HTML attributes.
	if !strings.Contains(source, "<") {
		source = html.UnescapeString(source)
	}
	result := []string{}
	tokenizer := xhtml.NewTokenizer(strings.NewReader(source))
	for {
		switch tokenizer.Next() {
		case xhtml.ErrorToken:
			if tokenizer.Err() == io.EOF {
				return result
			}
			return result
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			token := tokenizer.Token()
			if token.Data != "img" {
				continue
			}
			attrs := map[string]string{}
			for _, attr := range token.Attr {
				attrs[attr.Key] = attr.Val
			}
			selected := ""
			var chosen media.ProductImage
			for _, key := range []string{"data-original", "data-actualsrc", "data-lazy-src", "data-lazyload", "data-ks-lazyload", "data-src", "data-srcset", "srcset", "src"} {
				value := attrs[key]
				if strings.HasSuffix(key, "srcset") {
					value = bestSrcset(value)
				}
				if image, ok := media.ParseProductImage(value); ok && !image.Small {
					if selected == "" || (image.Key == chosen.Key && image.Quality > chosen.Quality) {
						selected, chosen = value, image
					}
				}
			}
			if selected != "" {
				result = append(result, selected)
			}
		}
	}
}

func bestSrcset(value string) string {
	best, quality := "", -1.0
	for text := strings.TrimSpace(value); text != ""; {
		end := strings.IndexAny(text, " \t\r\n\f")
		if end < 0 {
			if quality < 1 {
				best = strings.TrimRight(text, ",")
			}
			break
		}
		candidate := text[:end]
		text = strings.TrimSpace(text[end:])
		descriptor := ""
		if !strings.HasSuffix(candidate, ",") {
			end = strings.IndexByte(text, ',')
			if end < 0 {
				descriptor, text = text, ""
			} else {
				descriptor, text = text[:end], strings.TrimSpace(text[end+1:])
			}
		}
		candidate = strings.TrimRight(candidate, ",")
		score := 1.0
		if number, err := strconv.ParseFloat(strings.TrimRight(strings.TrimSpace(descriptor), "wx"), 64); err == nil {
			score = number
		}
		if score > quality {
			if image, ok := media.ParseProductImage(candidate); ok && !image.Small {
				best, quality = candidate, score
			}
		}
	}
	return best
}

// Group ownership follows first appearance in main > skus > details, while the
// download URL is selected from the best usable candidate across all groups.
func productImageGroups(main, skus, details []string) ([]string, []string, []string) {
	return media.ProductImageGroups(main, skus, details)
}

func extractProductImages(item map[string]any) ([]string, []string, []string) {
	main := append(extractURLs(item["pic_url"], true), extractURLs(item["item_imgs"], true)...)
	skus := []string{}
	for _, key := range []string{"prop_imgs", "props_img", "skus"} {
		skus = append(skus, extractURLs(item[key], true)...)
	}
	details := append(extractURLs(item["desc_img"], true), extractURLs(item["desc"], true)...)
	return productImageGroups(main, skus, details)
}

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

// skuSpecs keeps only named properties associated with a specific SKU.
func skuSpecs(item map[string]any) map[string]map[string]string {
	names := map[string]string{}
	labels := map[string]variantLabel{}
	readPropertyLabels(item["props_list"], labels)
	if entries, ok := decodedVariantValue(item["props_list"]).(map[string]any); ok {
		for key, value := range entries {
			if text, ok := value.(string); ok {
				if name, _, ok := strings.Cut(text, ":"); ok {
					names[key] = strings.TrimSpace(name)
				}
			}
		}
	}
	rows := variantRows(item["skus"], "sku", "skus", "items", "list")
	for _, source := range append([]map[string]any{item}, rows...) {
		value := firstText(source, "properties_name", "props_name")
		readPropertyNames(value, labels)
		for _, token := range strings.Split(value, ";") {
			parts := strings.SplitN(strings.TrimSpace(token), ":", 4)
			if len(parts) == 4 {
				names[parts[0]+":"+parts[1]] = strings.TrimSpace(parts[2])
			}
		}
	}
	result := map[string]map[string]string{}
	for _, row := range rows {
		id := firstText(row, "sku_id", "skuId", "skuid")
		if id == "" {
			continue
		}
		specs := map[string]string{}
		for _, key := range skuPropertyKeys(row) {
			if name, value := names[key], labels[key].label; name != "" && value != "" {
				specs[name] = value
			}
		}
		for label, value := range map[string]string{
			"颜色": firstText(row, "color_name", "color"),
			"尺码": firstText(row, "size_name", "size"),
		} {
			if value != "" && specs[label] == "" {
				specs[label] = value
			}
		}
		if len(specs) > 0 {
			result[id] = specs
		}
	}
	return result
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
