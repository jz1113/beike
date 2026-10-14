package generate

import "strings"

func exportMetadataBytes(payload map[string]any) (int, bool) {
	products, ok := payload["products"].([]any)
	if !ok {
		text, ok := exportCopyText(payload)
		if !ok {
			return 0, false
		}
		return len(text), true
	}
	total := 0
	for _, item := range products {
		product, ok := item.(map[string]any)
		if !ok {
			return 0, false
		}
		text, ok := exportCopyText(product)
		if !ok {
			return 0, false
		}
		total += len(text)
	}
	return total, true
}

func exportCopyText(product map[string]any) (string, bool) {
	title := exportString(product, "copywritingTitle")
	content := exportString(product, "copywritingContent")
	description, ok := sourceDescription(product)
	if !ok {
		return "", false
	}
	tags, ok := exportTags(product["copywritingTags"])
	if !ok {
		return "", false
	}
	if title != "" || content != "" {
		lines := []string{}
		if title != "" {
			lines = append(lines, "【小红书种草标题】：\n"+strings.TrimSpace(title)+"\n")
		}
		if content != "" {
			lines = append(lines, "【小红书买家秀正文】：\n"+strings.TrimSpace(content)+"\n")
		}
		if len(tags) > 0 {
			parts := make([]string, len(tags))
			for index, tag := range tags {
				if strings.HasPrefix(tag, "#") {
					parts[index] = tag
				} else {
					parts[index] = "#" + tag
				}
			}
			lines = append(lines, "【话题标签】：\n"+strings.Join(parts, " ")+"\n")
		}
		if strings.TrimSpace(description) != "" {
			lines = append(lines, "【来源与说明】：\n"+strings.TrimSpace(description)+"\n")
		}
		return strings.Join(lines, "\n"), true
	}
	return strings.TrimSpace(description), true
}

func sourceDescription(product map[string]any) (string, bool) {
	description, ok := exportOptionalString(product, "description")
	if !ok {
		return "", false
	}
	source, ok := exportOptionalString(product, "sourceUrl")
	if !ok {
		return "", false
	}
	if source != "" && !strings.Contains(description, source) {
		if description != "" {
			return description + "\n来源链接：" + source, true
		}
		return "来源链接：" + source, true
	}
	return description, true
}

func offlineMatrixNeedsUpstream(payload map[string]any) bool {
	if payload["offlineMatrix"] != true {
		return false
	}
	value, ok := payload["products"]
	if !ok || value == nil {
		return false
	}
	products, ok := value.([]any)
	return !ok || len(products) > 0
}

func matrixShotCount(payload map[string]any) (int, bool) {
	products, ok := payload["products"].([]any)
	if !ok || len(products) == 0 {
		return 0, false
	}
	total := 0
	for _, item := range products {
		product, ok := item.(map[string]any)
		if !ok {
			return 0, false
		}
		images, ok := product["images"].([]any)
		if !ok {
			return 0, false
		}
		shots := map[int]struct{}{}
		for index, image := range images {
			shot := index + 1
			if object, ok := image.(map[string]any); ok {
				if number, ok := wholeNumber(object["shotNo"]); ok {
					shot = number
				}
			}
			if shot >= 1 && shot <= 4 {
				shots[shot] = struct{}{}
			}
		}
		total += len(shots)
	}
	return total, true
}

func exportString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func exportOptionalString(payload map[string]any, key string) (string, bool) {
	value, ok := payload[key]
	if !ok || value == nil {
		return "", true
	}
	text, ok := value.(string)
	return text, ok
}

func exportTags(value any) ([]string, bool) {
	if value == nil {
		return nil, true
	}
	items, ok := value.([]any)
	if !ok {
		return nil, false
	}
	tags := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok {
			return nil, false
		}
		tags = append(tags, text)
	}
	return tags, true
}

func wholeNumber(value any) (int, bool) {
	number, ok := value.(float64)
	if !ok || number != float64(int(number)) {
		return 0, false
	}
	return int(number), true
}
