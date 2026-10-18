package generate

import (
	"encoding/json"
	"regexp"
	"strings"
)

func videoInputError(payload map[string]json.RawMessage, model string) string {
	images := videoFrameList(payload)
	videos := rawStringList(payload["videos"])
	mode := resolveVideoMode(model, videoRefMode(payload), len(images), len(videos))
	if !videoModeAllowed(model, mode) {
		return "当前模型尚未接入这种生成方式，请切换模式"
	}
	if mode == "text" && (len(images) > 0 || len(videos) > 0) {
		return "文生视频不使用参考素材，请移除素材或切换生成方式"
	}
	if mode == "first_frame" && (len(images) != 1 || len(videos) > 0) {
		return "首帧模式需要一张图片"
	}
	if mode == "first_last_frame" && (len(images) != 2 || len(videos) > 0) {
		return "首尾帧模式需要两张图片，分别作为首帧和尾帧"
	}
	if (mode == "edit" || mode == "extend") && len(videos) == 0 {
		return "请添加需要编辑或延长的参考视频"
	}
	if len(videos) > 0 && !referenceVideoAllowed(model) {
		return "当前模型的参考视频尚未接入，请使用图片或文字"
	}
	if regexp.MustCompile(`^viduq3(?:-mix)?$`).MatchString(model) && len(images) == 0 {
		return "该模型需要参考图片，请添加素材"
	}
	if regexp.MustCompile(`^vidu`).MatchString(model) && len(images) > 7 {
		return "Vidu 最多支持 7 张参考图片"
	}
	if regexp.MustCompile(`^veo3\.1`).MatchString(model) && mode == "omni" && len(images) > 3 {
		return "Veo 最多支持 3 张参考图片"
	}
	if regexp.MustCompile(`^wan3`).MatchString(model) && (len(images) > 10 || len(videos) > 5) {
		return "万相最多支持 10 张参考图、5 个参考视频"
	}
	if regexp.MustCompile(`(?i)minimax-h3`).MatchString(model) && (len(images) > 9 || len(videos) > 3 || len(images)+len(videos) > 12) {
		return "H3 最多支持 9 张参考图、3 个参考视频，合计不超过 12 个素材"
	}
	if regexp.MustCompile(`(?i)grok-imagine-video`).MatchString(model) && mode == "omni" && len(images) > 14 {
		return "Grok 最多支持 14 张参考图片"
	}
	if regexp.MustCompile(`kling.*omni`).MatchString(model) && len(images) > 7 {
		return "可灵 Omni 最多支持 7 张参考图片"
	}
	if regexp.MustCompile(`(?i)seedance`).MatchString(model) {
		maxImages, maxVideos := 9, 3
		if regexp.MustCompile(`(?i)seedance-2[.-]5`).MatchString(model) {
			maxImages, maxVideos = 30, 10
		}
		if len(images) > maxImages || len(videos) > maxVideos {
			return "当前模型最多支持 " + Itoa(maxImages) + " 张参考图、" + Itoa(maxVideos) + " 个参考视频"
		}
	}
	resolution := defaultVideoResolution(model)
	if value := rawStringValue(payload["resolution"]); value != "" {
		resolution = strings.ToUpper(value)
	}
	aspect := "16:9"
	if value := rawStringValue(payload["aspect_ratio"]); value != "" {
		aspect = value
	}
	duration := 5.0
	if raw, ok := payload["duration"]; ok {
		if json.Unmarshal(raw, &duration) != nil {
			return ""
		}
	}
	return videoSpecError(model, mode, resolution, aspect, duration)
}

func videoFrameList(payload map[string]json.RawMessage) []string {
	images := rawStringList(payload["images"])
	first := rawStringValue(payload["first_frame_image"])
	reference := rawStringValue(payload["referenceImageUrl"])
	last := rawStringValue(payload["last_frame_image"])
	if first != "" && !containsString(images, first) {
		images = append([]string{first}, images...)
	}
	if reference != "" && !containsString(images, reference) {
		images = append([]string{reference}, images...)
	}
	if last != "" && !containsString(images, last) {
		images = append(images, last)
	}
	return images
}

func videoRefMode(payload map[string]json.RawMessage) string {
	if mode := rawStringValue(payload["ref_mode"]); mode != "" {
		return mode
	}
	if rawStringValue(payload["last_frame_image"]) != "" {
		return "first_last_frame"
	}
	if rawStringValue(payload["first_frame_image"]) != "" {
		return "first_frame"
	}
	return "omni"
}

func resolveVideoMode(model, mode string, imageCount, videoCount int) string {
	if mode == "" {
		preferred := "text"
		if videoCount > 0 || imageCount > 2 {
			preferred = "omni"
		} else if imageCount == 2 {
			preferred = "first_last_frame"
		} else if imageCount == 1 {
			preferred = "first_frame"
		}
		if videoModeAllowed(model, preferred) {
			return preferred
		}
		return videoModes(model)[0]
	}
	normalized := mode
	if mode == "multi_frame" || mode == "reference_image" {
		normalized = "omni"
	}
	if normalized == "omni" && !videoModeAllowed(model, "omni") && videoCount == 0 && imageCount <= 1 {
		if imageCount > 0 {
			return "first_frame"
		}
		return "text"
	}
	return normalized
}

func videoModeAllowed(model, mode string) bool {
	for _, item := range videoModes(model) {
		if item == mode {
			return true
		}
	}
	return false
}

func referenceVideoAllowed(model string) bool {
	return regexp.MustCompile(`(?i)seedance`).MatchString(model) || regexp.MustCompile(`^wan3`).MatchString(model) || regexp.MustCompile(`(?i)minimax-h3`).MatchString(model)
}

func videoModes(model string) []string {
	id := strings.ToLower(model)
	full := []string{"omni", "first_frame", "first_last_frame", "text"}
	framed := []string{"first_frame", "first_last_frame", "text"}
	switch {
	case regexp.MustCompile(`seedance`).MatchString(id):
		return []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"}
	case id == "viduq3" || id == "viduq3-mix":
		return []string{"omni"}
	case id == "viduq3-turbo" || id == "viduq3-pro":
		return full
	case regexp.MustCompile(`omni[_-]flash`).MatchString(id):
		return []string{"first_frame", "text"}
	case regexp.MustCompile(`^veo3\.1`).MatchString(id):
		return full
	case regexp.MustCompile(`sora`).MatchString(id):
		return []string{"first_frame", "text"}
	case regexp.MustCompile(`grok`).MatchString(id):
		return full
	case regexp.MustCompile(`kling`).MatchString(id) && strings.Contains(id, "omni"):
		return full
	case regexp.MustCompile(`kling`).MatchString(id):
		return framed
	case regexp.MustCompile(`wan`).MatchString(id):
		return full
	case regexp.MustCompile(`minimax|hailuo`).MatchString(id) || id == "h3":
		return full
	default:
		return []string{"first_frame", "text"}
	}
}

func rawStringList(raw json.RawMessage) []string {
	var items []string
	if json.Unmarshal(raw, &items) != nil {
		return nil
	}
	return items
}

func rawStringValue(raw json.RawMessage) string {
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	return strings.TrimSpace(value)
}
