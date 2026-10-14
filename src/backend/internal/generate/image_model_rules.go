package generate

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

func imageModelRuleError(payload map[string]json.RawMessage, model string) string {
	id := strings.ToLower(strings.TrimSpace(model))
	if id == "qwen-image-edit" || id == "qwen-image-edit-2509" {
		count := referenceCount(payload)
		if count == 0 {
			return "Qwen 图像编辑需要至少一张参考图。"
		}
		if id == "qwen-image-edit" && count > 1 {
			return "qwen-image-edit 仅支持一张参考图；多图编辑请选择 qwen-image-edit-2509。"
		}
	}
	if id != "seedream-v5-pro" {
		return ""
	}
	requested := strings.TrimSpace(rawString(payload, "size"))
	if requested == "" {
		requested = strings.TrimSpace(rawString(payload, "aspectRatio"))
	}
	if requested == "" {
		requested = "2448x3264"
	}
	if regexp.MustCompile(`(?i)^[3-9]k$`).MatchString(requested) {
		return "seedream-v5-pro 仅支持 1K～2K，请调整分辨率。"
	}
	if matched := regexp.MustCompile(`(?i)^(\d+)\s*x\s*(\d+)$`).FindStringSubmatch(requested); matched != nil {
		width, _ := strconv.Atoi(matched[1])
		height, _ := strconv.Atoi(matched[2])
		if width < 1024 || width > 2048 || height < 1024 || height > 2048 {
			return "seedream-v5-pro 支持 1K～2K 尺寸，请将分辨率改为 2K 或使用支持 4K 的模型。"
		}
		return ""
	}
	if regexp.MustCompile(`(?i)^(?:1k|2k|1024|2048)$`).MatchString(requested) {
		return ""
	}
	if seedreamRatioTooNarrow(requested) {
		return "seedream-v5-pro 当前比例超出已验证的 1K～2K 尺寸范围，请选择 1:1、3:4、4:3、9:16 或 16:9。"
	}
	return ""
}

func referenceCount(payload map[string]json.RawMessage) int {
	seen := map[string]struct{}{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	for _, key := range []string{"productImageUrl", "referenceImageUrl", "anchorFaceImageUrl", "sceneAnchorImageUrl"} {
		add(rawString(payload, key))
	}
	for _, key := range []string{"images", "referenceImages", "productReferenceImages"} {
		var items []json.RawMessage
		if json.Unmarshal(payload[key], &items) != nil {
			continue
		}
		for _, item := range items {
			var text string
			if json.Unmarshal(item, &text) == nil {
				add(text)
			}
		}
	}
	return len(seen)
}

func seedreamRatioTooNarrow(requested string) bool {
	ratio := aspectRatioFromSize(requested)
	parts := strings.Split(ratio, ":")
	if len(parts) != 2 {
		return true
	}
	width, errW := strconv.Atoi(parts[0])
	height, errH := strconv.Atoi(parts[1])
	if errW != nil || errH != nil || width < 1 || height < 1 {
		return true
	}
	scale := 2048.0 / float64(max(width, height))
	return int(float64(width)*scale+0.5) < 1024 || int(float64(height)*scale+0.5) < 1024
}

func aspectRatioFromSize(size string) string {
	clean := strings.TrimSpace(size)
	if clean == "" || clean == "auto" {
		return "3:4"
	}
	known := map[string]struct{}{"3:4": {}, "4:3": {}, "9:16": {}, "16:9": {}, "1:1": {}, "2:3": {}, "3:2": {}, "4:5": {}, "5:4": {}, "21:9": {}}
	if _, ok := known[clean]; ok {
		return clean
	}
	if strings.Contains(strings.ToLower(clean), "x") {
		parts := strings.Split(strings.ToLower(clean), "x")
		if len(parts) == 2 {
			width, errW := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
			height, errH := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
			if errW == nil && errH == nil && width > 0 && height > 0 {
				ratio := width / height
				switch {
				case abs(ratio-1) < 0.08:
					return "1:1"
				case abs(ratio-0.75) < 0.08:
					return "3:4"
				case abs(ratio-1.333) < 0.08:
					return "4:3"
				case abs(ratio-0.5625) < 0.08:
					return "9:16"
				case abs(ratio-1.777) < 0.08:
					return "16:9"
				case abs(ratio-0.666) < 0.08:
					return "2:3"
				case abs(ratio-1.5) < 0.08:
					return "3:2"
				case abs(ratio-0.8) < 0.08:
					return "4:5"
				case abs(ratio-1.25) < 0.08:
					return "5:4"
				case abs(ratio-2.37) < 0.1:
					return "21:9"
				}
			}
		}
	}
	return "3:4"
}

func abs(value float64) float64 {
	if value < 0 {
		return -value
	}
	return value
}
