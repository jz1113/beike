package generate

import (
	"encoding/json"
	"regexp"
	"strings"
)

func rawBoolPresent(payload map[string]json.RawMessage, key string) (bool, bool) {
	raw, ok := payload[key]
	if !ok {
		return false, false
	}
	var value bool
	if json.Unmarshal(raw, &value) != nil {
		return false, false
	}
	return value, true
}

func videoInputError(payload map[string]json.RawMessage, model string, bases ...string) string {
	if message := videoPromptInputError(payload, model); message != "" {
		return message
	}
	if message := videoSeedInputError(payload, model); message != "" {
		return message
	}
	base := rawStringValue(payload["customBaseUrl"])
	if len(bases) > 0 {
		base = bases[0]
	}
	images := videoFrameList(payload)
	videos := rawStringList(payload["videos"])
	mode := resolveVideoMode(model, videoRefMode(payload), len(images), len(videos))
	if falOmniVideo(model) {
		if !isFalImageBase(base) {
			return "Gemini Omni Flash 需要绑定 fal 队列渠道"
		}
		if videoCapabilityModelID(model) == falOmni10Model && mode == "omni" && len(videos) > 0 {
			return "Omni Flash 1.0 的全能参考只支持图片"
		}
		if mode == "omni" && len(images)+len(videos) == 0 {
			return "全能参考需要至少一项素材，纯文字请切换文生视频"
		}
		if len(images) > 10 || len(videos) > 3 {
			return "Gemini Omni Flash 1.2 最多支持 10 张参考图和 3 段参考视频"
		}
		if (mode == "edit" || mode == "extend") && (len(videos) != 1 || len(images) != 0) {
			return "Gemini Omni Flash 1.2 的编辑和延长需要一段视频，不混用参考图"
		}
		if audio, supplied := rawBoolPresent(payload, "audio"); supplied && !audio {
			return "Gemini Omni Flash 1.2 的 fal 接口使用原生音频，不提供静音开关"
		}
	}

	if kling4Model(model) {
		if nativeVideoProvider(base) != "kling" {
			return "可灵 4.0 系列需要绑定可灵官方 API 渠道"
		}
		if len(images) > 10 || len(videos) > 5 || len(images)+len(videos) > 15 {
			return "可灵 4.0 系列最多支持 10 张图片、5 段视频，合计最多 15 项"
		}
		if mode == "text" && rawString(payload, "aspect_ratio") == "adaptive" {
			return "可灵 4.0 文生视频需要指定宽高比"
		}
		if mode == "first_frame" || mode == "first_last_frame" {
			if ratio := rawString(payload, "aspect_ratio"); ratio != "" && ratio != "adaptive" {
				return "可灵 4.0 图生视频的宽高比跟随关键帧，请选择自动比例"
			}
		}
	}
	if veoModel(model) {
		if veoNativeBase(base) {
			if _, err := veoNativeURL(base, model); err != nil {
				return err.Error()
			}
		}
		if mode == "extend" && (len(videos) != 1 || len(images) > 0 || len(rawStringList(payload["audios"])) > 0) {
			return "Veo 延长需要且仅接受一段视频，不混用参考图片或音频"
		}
	}
	if message := grokOfficialModeError(base, model, mode); message != "" {
		return message
	}
	if message := grokVoiceInputError(payload, model, mode); message != "" {
		return message
	}
	if message := videoAudioInputError(payload, model, mode, len(images)+len(videos)); message != "" {
		return message
	}
	nativeTail := mode == "last_frame" && minimaxH3(model) && (minimaxOfficialHost(base) || minimaxMetasoHost(base))
	nativeMotion := mode == "motion_control" && (nativeVideoProvider(base) == "kling" || minimaxComflyHost(base)) && (model == "kling-video-v3" || model == "kling-video-v2-6")
	if !videoModeAllowed(model, mode) && !nativeTail && !nativeMotion {
		return "当前模型尚未接入这种生成方式，请切换模式"
	}
	if mode == "text" && (len(images) > 0 || len(videos) > 0) {
		return "文生视频不使用参考素材，请移除素材或切换生成方式"
	}
	if mode == "first_frame" && (len(images) != 1 || len(videos) > 0) {
		return "首帧模式需要一张图片"
	}
	if mode == "last_frame" && (len(images) != 1 || len(videos) > 0) {
		return "尾帧模式需要一张图片作为结束画面"
	}
	if mode == "first_last_frame" && (len(images) != 2 || len(videos) > 0) {
		return "首尾帧模式需要两张图片，分别作为首帧和尾帧"
	}
	if (mode == "edit" || mode == "extend") && len(videos) == 0 {
		return "请添加需要编辑或延长的参考视频"
	}
	grokClip := regexp.MustCompile(`(?i)grok`).MatchString(model) && (mode == "edit" || mode == "extend")
	if mode == "motion_control" && (len(images) != 1 || len(videos) != 1) {
		return "动作控制需要一张人物图片和一段动作参考视频"
	}
	if len(videos) > 0 && !referenceVideoAllowed(model) && !grokClip && !nativeMotion && !(veoModel(model) && mode == "extend") {
		return "当前模型的参考视频尚未接入，请使用图片或文字"
	}
	if regexp.MustCompile(`(?i)^vidu`).MatchString(model) && (regexp.MustCompile(`(?i)^viduq3(?:-mix)?$`).MatchString(model) || viduQ4Preview(model) || mode == "omni") && len(images) == 0 {
		return "该模型需要参考图片，请添加素材"
	}
	if regexp.MustCompile(`(?i)^vidu`).MatchString(model) {
		maxViduImages := 7
		if viduQ4Preview(model) {
			maxViduImages = 15
		}
		if len(images) > maxViduImages {
			return "Vidu 最多支持 " + Itoa(maxViduImages) + " 张参考图片"
		}
	}
	if omniFlash(model) && len(images)+len(videos) > 7 {
		return "Omni Flash 最多支持 7 项参考素材（图片与视频合计）"
	}
	if regexp.MustCompile(`(?i)^veo-?3\.1`).MatchString(model) && mode == "omni" && len(images) > 3 {
		return "Veo 最多支持 3 张参考图片"
	}
	if regexp.MustCompile(`^wan3`).MatchString(model) && (len(images) > 10 || len(videos) > 5) {
		return "万相最多支持 10 张参考图、5 个参考视频"
	}
	if minimaxH3(model) && (len(images) > 9 || len(videos) > 3 || len(images)+len(videos) > 12) {
		return "H3 最多支持 9 张参考图、3 个参考视频，合计不超过 12 个素材"
	}
	if regexp.MustCompile(`(?i)grok-imagine-video`).MatchString(model) && mode == "omni" && len(images) > 14 {
		return "Grok 最多支持 14 张参考图片"
	}
	if regexp.MustCompile(`(?i)grok`).MatchString(model) && (mode == "edit" || mode == "extend") && (len(videos) != 1 || len(images) > 0) {
		return "请添加一段需要编辑或延长的视频"
	}
	if regexp.MustCompile(`(?i)kling.*omni`).MatchString(model) {
		if len(videos) > 1 {
			return "可灵 Omni 最多支持 1 个参考视频"
		}
		maxImages := 7
		if len(videos) > 0 {
			maxImages = 4
		}
		if len(images) > maxImages {
			return "可灵 Omni 最多支持 " + Itoa(maxImages) + " 张参考图片"
		}
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
	metasoH3 := minimaxH3(model) && minimaxMetasoHost(base)
	if metasoH3 {
		resolution = "480P"
	}
	if value := rawStringValue(payload["resolution"]); value != "" {
		resolution = strings.ToUpper(value)
	}
	aspect := "16:9"
	if value := rawStringValue(payload["aspect_ratio"]); value != "" {
		aspect = value
	}
	if minimaxH3(model) && (minimaxOfficialHost(base) || metasoH3 || minimaxComflyHost(base)) && (mode == "first_frame" || mode == "last_frame" || mode == "first_last_frame") && aspect == "adaptive" {
		aspect = "16:9"
	}
	if falOmniVideo(model) && (mode == "edit" || mode == "extend") && aspect == "adaptive" {
		aspect = "16:9"
	}
	duration := 5.0
	if raw, ok := payload["duration"]; ok {
		if json.Unmarshal(raw, &duration) != nil {
			return ""
		}
	} else if falOmniVideo(model) {
		duration = 8
	} else if omniFlash(model) {
		duration = 10
	} else if regexp.MustCompile(`(?i)grok`).MatchString(model) && mode == "extend" {
		duration = 6
	}
	if veoModel(model) && veoNativeBase(base) && strings.Contains(strings.ToLower(model), "fast") && resolution == "4K" {
		return "Veo Fast 官方渠道最高支持 1080P"
	}
	if veoModel(model) && mode == "extend" {
		seconds := 8
		if veoNativeBase(base) {
			seconds = 7
		}
		if duration != float64(seconds) {
			return "当前 Veo 延长方式需要新增 " + Itoa(seconds) + " 秒"
		}
		if strings.Contains(strings.ToLower(model), "fast") && veoNativeBase(base) && resolution == "4K" {
			return "Veo Fast 官方渠道最高支持 1080P"
		}
		return videoSpecError(model, mode, resolution, aspect, float64(seconds))
	}
	if metasoH3 {
		return minimaxMetasoSpecError(resolution, aspect, duration)
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
		if videoCount > 0 && veoModel(model) {
			preferred = "extend"
		} else if videoCount > 0 || imageCount > 2 {
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
	model = videoCapabilityModelID(model)
	return kling4Model(model) || regexp.MustCompile(`(?i)seedance`).MatchString(model) || regexp.MustCompile(`^wan3`).MatchString(model) || minimaxH3(model) || regexp.MustCompile(`(?i)kling.*omni|omni[_-]flash|gemini-omni`).MatchString(model)
}

func viduQ4Preview(id string) bool {
	switch videoCapabilityModelID(id) {
	case "viduq4-preview", "vidu-q4-preview", "viduq4":
		return true
	default:
		return false
	}
}

func videoModes(model string) []string {
	id := videoCapabilityModelID(model)
	full := []string{"omni", "first_frame", "first_last_frame", "text"}
	framed := []string{"first_frame", "first_last_frame", "text"}
	switch {
	case regexp.MustCompile(`seedance`).MatchString(id):
		return []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"}
	case id == "viduq3" || id == "viduq3-mix":
		return []string{"omni"}
	case id == "viduq3-pro":
		return framed
	case id == "viduq3-turbo":
		return full
	case viduQ4Preview(id):
		return []string{"omni", "first_frame"}
	case id == falOmni10Model:
		return []string{"omni", "first_frame", "text", "edit"}
	case omniFlash(id) || falOmniVideo(id):
		return []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"}
	case id == "veo3.1-pro":
		return framed
	case regexp.MustCompile(`^veo-?3\.1`).MatchString(id):
		return []string{"omni", "first_frame", "first_last_frame", "text", "extend"}
	case regexp.MustCompile(`sora`).MatchString(id):
		return []string{"first_frame", "text"}
	case regexp.MustCompile(`grok`).MatchString(id):
		return []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"}
	case id == "kling-4.0-flash":
		return []string{"omni", "first_frame", "text", "edit"}
	case id == "kling-4.0":
		return []string{"omni", "first_frame", "first_last_frame", "text", "edit"}
	case regexp.MustCompile(`kling`).MatchString(id) && strings.Contains(id, "omni"):
		return []string{"omni", "first_frame", "first_last_frame", "text", "edit", "extend"}
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
