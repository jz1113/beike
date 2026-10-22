package catalog

import "strings"

func validSkillPackage(content map[string]any) bool {
	for _, key := range []string{"description", "markdownDoc", "displayName", "author", "version", "icon", "colorTheme"} {
		if value, exists := content[key]; exists && value != nil {
			if _, ok := value.(string); !ok {
				return false
			}
		}
	}
	if value, exists := content["files"]; exists && value != nil {
		files, ok := value.([]any)
		if !ok || len(files) > 40 {
			return false
		}
		total := 0
		seen := map[string]bool{}
		for _, value := range files {
			file, ok := value.(map[string]any)
			if !ok {
				return false
			}
			path, pathOK := file["path"].(string)
			body, bodyOK := file["content"].(string)
			if !pathOK || !bodyOK || path == "" || strings.HasPrefix(path, "/") || strings.Contains(path, "\\") || seen[path] || skillTextUnits(body) > 256*1024 {
				return false
			}
			for _, part := range strings.Split(path, "/") {
				if part == "" || part == "." || part == ".." {
					return false
				}
			}
			total += skillTextUnits(body)
			if total > 1024*1024 {
				return false
			}
			seen[path] = true
		}
	}
	if value, exists := content["meta"]; exists && value != nil {
		meta, ok := value.(map[string]any)
		if !ok {
			return false
		}
		for _, key := range []string{"genres", "tags", "showcaseUrls"} {
			if value, exists := meta[key]; exists && value != nil {
				if !skillStringList(value) {
					return false
				}
			}
		}
		for _, key := range []string{"coverUrl", "promptGuide", "assetGuide", "defaultVideoModel", "defaultImageModel"} {
			if value, exists := meta[key]; exists && value != nil {
				if _, ok := value.(string); !ok {
					return false
				}
			}
		}
	}
	for _, key := range []string{"references", "steps"} {
		if value, exists := content[key]; exists && value != nil {
			list, ok := value.([]any)
			if !ok {
				return false
			}
			for _, value := range list {
				item, ok := value.(map[string]any)
				if !ok {
					return false
				}
				field := "path"
				if key == "steps" {
					field = "label"
				}
				if _, ok := item[field].(string); !ok {
					return false
				}
			}
		}
	}
	return true
}

// Match the browser vault's UTF-16 character limits, including Chinese text.
func skillTextUnits(text string) int {
	units := 0
	for _, char := range text {
		units++
		if char > 0xFFFF {
			units++
		}
	}
	return units
}

func skillStringList(value any) bool {
	list, ok := value.([]any)
	if !ok {
		return false
	}
	for _, value := range list {
		if _, ok := value.(string); !ok {
			return false
		}
	}
	return true
}
