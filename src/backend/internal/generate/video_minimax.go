package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
)

func minimaxH3(model string) bool {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case "h3", "minimax-h3":
		return true
	default:
		return false
	}
}

func minimaxH3Resolution(resolution string) string {
	switch strings.ToUpper(strings.TrimSpace(resolution)) {
	case "1080P", "2K":
		return "2K"
	case "480P":
		return "480P"
	default:
		return "768P"
	}
}

func minimaxH3Payload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	if audioSet && !audio && !strings.Contains(prompt, "silent") && !strings.Contains(prompt, "无声") && !strings.Contains(prompt, "静音") {
		prompt = strings.TrimSpace(prompt) + " (silent video, no sound)"
	}
	content := []map[string]any{{"type": "text", "text": prompt}}
	for index, image := range images {
		role := "reference_image"
		if mode == "last_frame" {
			role = "last_frame"
		}
		if mode == "first_frame" || mode == "first_last_frame" {
			role = "first_frame"
			if index > 0 {
				role = "last_frame"
			}
		}
		content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": image}, "role": role})
	}
	for _, video := range videos {
		content = append(content, map[string]any{"type": "video_url", "video_url": map[string]string{"url": video}, "role": "reference_video"})
	}
	if mode == "first_frame" || mode == "last_frame" || mode == "first_last_frame" {
		ratio = "adaptive"
	}
	body := map[string]any{"model": model, "content": content, "duration": duration, "resolution": minimaxH3Resolution(resolution), "ratio": ratio}
	if strings.EqualFold(model, "h3") || strings.EqualFold(model, "minimax-h3") {
		body["model"] = "MiniMax-H3"
	}
	if watermark {
		body["aigc_watermark"] = true
	}
	return body
}

func minimaxOfficialHost(base string) bool {
	parsed, err := url.Parse(base)
	if err != nil {
		return false
	}
	switch strings.ToLower(parsed.Hostname()) {
	case "api.minimax.cn", "api.minimaxi.com", "api.minimax.io":
		return true
	default:
		return false
	}
}

func minimaxComflyHost(base string) bool {
	parsed, err := url.Parse(base)
	return err == nil && (strings.EqualFold(parsed.Hostname(), "ai.comfly.org") || strings.EqualFold(parsed.Hostname(), "comfly.org"))
}

func minimaxH3Route(base string) (submit, query []string) {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	if minimaxMetasoHost(base) {
		root = minimaxMetasoRoot(base)
		return []string{root + "/video_generation"}, []string{root + "/query/video_generation/{taskId}"}
	}
	if minimaxOfficialHost(base) {
		root = strings.TrimSuffix(root, "/v2")
		return []string{root + "/v2/video_generation"}, []string{root + "/v2/query/video_generation/{taskId}"}
	}
	if minimaxComflyHost(base) {
		return []string{root + "/v1/videos"}, []string{root + "/v1/videos/{taskId}"}
	}
	// Unknown gateways retain their previous flat JSON routes. Official content
	// is never retried against a gateway's unrelated /v1/videos protocol.
	return []string{root + "/v1/videos", root + "/v2/videos/generations", root + "/minimax/v1/video_generation"},
		[]string{root + "/v1/videos/{taskId}", root + "/v2/videos/generations/{taskId}", root + "/minimax/v1/query/video_generation?task_id={taskId}"}
}

// Keep canonical content while preparing local references, then map the actual
// wire protocol once the selected host is known. Comfly's published H3 API is
// multipart; its JSON endpoint is documented as not yet open.
func routeMinimaxH3Submission(base string, adapted *videoAdapted) map[string][]string {
	adapted.endpoints, adapted.queries = minimaxH3Route(base)
	if minimaxOfficialHost(base) || minimaxMetasoHost(base) {
		return nil
	}
	content, _ := adapted.payload["content"].([]map[string]any)
	body := map[string]any{
		"model": adapted.payload["model"], "prompt": "", "seconds": strconv.Itoa(adapted.duration),
		"aspect_ratio": adapted.payload["ratio"], "resolution": adapted.payload["resolution"], "mode": "multimodal-to-video",
	}
	if body["resolution"] == "2K" {
		body["resolution"] = "2k"
	}
	for _, item := range content {
		kind, _ := item["type"].(string)
		if kind == "text" {
			body["prompt"] = item["text"]
			continue
		}
		field := map[string]string{"image_url": "imageUrls", "video_url": "videoUrls", "audio_url": "audioUrls"}[kind]
		if field == "" {
			continue
		}
		node, _ := item[kind].(map[string]string)
		refs, _ := body[field].([]string)
		body[field] = append(refs, node["url"])
		if role, _ := item["role"].(string); role == "first_frame" || role == "last_frame" {
			body["mode"] = "image-to-video"
		}
	}
	if len(content) == 1 {
		body["mode"] = "text-to-video"
	}
	adapted.payload = body
	if !minimaxComflyHost(base) {
		return nil
	}
	fields := make(map[string][]string, len(body))
	for key, value := range body {
		if text, ok := value.(string); ok {
			fields[key] = []string{text}
		} else if refs, ok := value.([]string); ok {
			fields[key] = refs
		}
	}
	return fields
}

func prepareMinimaxH3Media(ctx context.Context, root string, body map[string]any, workspace string, production bool, cfg *storage.ObjectConfig) error {
	content, _ := body["content"].([]map[string]any)
	imageIndex := 0
	for _, item := range content {
		kind, _ := item["type"].(string)
		if kind == "text" {
			continue
		}
		node, _ := item[kind].(map[string]string)
		ref := strings.TrimSpace(node["url"])
		if strings.HasPrefix(ref, "//") {
			ref = "https:" + ref
		}
		var err error
		switch kind {
		case "image_url":
			ref, err = dashscopeImageRef(ctx, ref, imageIndex, workspace, production)
			imageIndex++
		case "video_url":
			if strings.HasPrefix(ref, "/storage/") {
				if cfg == nil {
					return imageEditPrepareError{"当前未配置对象存储，H3 参考视频需要公网可访问链接，请先完成对象存储配置"}
				}
				ref, err = uploadVideoReference(ctx, ref, workspace, production, *cfg)
			}
		case "audio_url":
			ref, err = resolveWanAudioRef(ctx, root, ref, workspace, production, cfg)
		}
		if err != nil {
			return err
		}
		if kind != "image_url" {
			parsed, parseErr := url.Parse(ref)
			if parseErr != nil || parsed.Host == "" || parsed.User != nil || parsed.Scheme != "https" && parsed.Scheme != "http" {
				return imageEditPrepareError{"H3 参考视频与音频需要公网 HTTP(S) 链接或当前工作区素材"}
			}
		}
		item[kind] = map[string]string{"url": ref}
	}
	return nil
}

func minimaxMetasoHost(base string) bool {
	parsed, err := url.Parse(strings.TrimSpace(base))
	return err == nil && strings.EqualFold(parsed.Hostname(), "metaso.cn")
}

func minimaxMetasoRoot(base string) string {
	parsed, _ := url.Parse(strings.TrimSpace(base))
	return parsed.Scheme + "://" + parsed.Host + "/api/minimax/v2"
}

func minimaxMetasoResolution(resolution string) string {
	resolution = strings.ToUpper(strings.TrimSpace(resolution))
	if resolution == "720P" {
		return "768P"
	}
	if resolution == "" {
		return "480P"
	}
	return resolution
}

func minimaxMetasoSpecError(resolution, aspect string, duration float64) string {
	resolution = minimaxMetasoResolution(resolution)
	if !containsString([]string{"480P", "768P", "1080P", "2K"}, resolution) {
		return "当前模型不支持所选清晰度，请重新选择"
	}
	if !containsString(videoRatios, aspect) {
		return "当前模型不支持所选比例，请重新选择"
	}
	if duration != float64(int(duration)) || duration < 4 || duration > 15 {
		return "为避免超时长翻倍计费，秘塔 H3 生成时长限制为 4～15 秒（整数）"
	}
	return ""
}

// Metaso has its own H3 output tiers and duration caps. Apply those only after
// resolving the selected base, before claiming the original request.
func applyMinimaxH3Channel(base string, payload map[string]json.RawMessage, adapted *videoAdapted) {
	if !minimaxH3(adapted.modelID) || !minimaxMetasoHost(base) {
		return
	}
	resolution := minimaxMetasoResolution(rawStringValue(payload["resolution"]))
	adapted.resolution = resolution
	adapted.size = videoPixelSize(adapted.ratio, resolution)
	adapted.payload["resolution"] = resolution
	adapted.payload["fast_mode"] = false
	contextIR, present := rawBoolPresent(payload, "context_ir_enabled")
	if !present {
		contextIR = true
	}
	adapted.payload["context_ir_enabled"] = contextIR
}
