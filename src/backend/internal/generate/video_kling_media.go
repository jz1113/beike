package generate

import (
	"beike.local/cloud/src/backend/internal/platform/storage"
	"context"
	"regexp"
	"strings"
)

func kling4Model(model string) bool {
	return model == "kling-4.0" || model == "kling-4.0-flash"
}

var kling4ReferenceMention = regexp.MustCompile(`@(?:图片|图|视频)[ \t]*(\d+)`)

func kling4Payload(prompt, mode, ratio, resolution string, duration int, images, videos []string, watermark bool) map[string]any {
	settings := map[string]any{"resolution": resolution, "duration": duration}
	body := map[string]any{"settings": settings, "options": map[string]any{"watermark_info": map[string]bool{"enabled": watermark}}}
	if mode == "text" {
		settings["aspect_ratio"] = ratio
		body["prompt"] = prompt
		return body
	}
	frames := mode == "first_frame" || mode == "first_last_frame"
	if !frames {
		settings["aspect_ratio"] = ratio
	}
	prompt = kling4ReferenceMention.ReplaceAllStringFunc(prompt, func(mention string) string {
		number := kling4ReferenceMention.FindStringSubmatch(mention)[1]
		if strings.HasPrefix(mention, "@视频") {
			return "@video_" + number
		}
		return "@image_" + number
	})
	contents := []map[string]string{{"type": "prompt", "text": prompt}}
	for index, image := range images {
		role := "refer_image"
		if frames {
			role = "first_frame"
			if index > 0 {
				role = "last_frame"
			}
		}
		contents = append(contents, map[string]string{"type": role, "url": image, "id": "image_" + Itoa(index+1)})
	}
	for index, video := range videos {
		role := "feature_video"
		if mode == "edit" && index == 0 {
			role = "base_video"
		}
		contents = append(contents, map[string]string{"type": role, "url": video, "id": "video_" + Itoa(index+1)})
	}
	body["contents"] = contents
	return body
}

func attachKlingVideos(body map[string]any, mode string, videos []string, audio, audioSet bool) {
	if len(videos) == 0 {
		return
	}
	role, sound := "feature", "yes"
	if mode == "extend" {
		body["prompt"] = "Based on <<<video_1>>>, continue the action forward and generate the next shot.\n" + firstString(body, "prompt")
	}
	if mode == "edit" {
		role = "base"
		delete(body, "duration")
		delete(body, "aspect_ratio")
		delete(body, "ratio")
		body["multi_shot"] = false
	}
	if audioSet && !audio {
		sound = "no"
	}
	list := make([]map[string]string, 0, len(videos))
	for _, ref := range videos {
		list = append(list, map[string]string{"video_url": ref, "refer_type": role, "keep_original_sound": sound})
	}
	body["video_list"], body["sound"] = list, "off"
}

func prepareKlingMedia(ctx context.Context, root string, body map[string]any, workspace string, production bool, storeCfg *storage.ObjectConfig) error {
	if contents, ok := body["contents"].([]map[string]string); ok {
		for _, entry := range contents {
			var list, field string
			switch entry["type"] {
			case "image", "first_frame", "middle_frame", "last_frame", "refer_image":
				list, field = "image_list", "image_url"
			case "video", "base_video", "feature_video":
				list, field = "video_list", "video_url"
			default:
				continue
			}
			ref := map[string]string{field: entry["url"]}
			if err := prepareKlingMedia(ctx, root, map[string]any{list: []map[string]string{ref}}, workspace, production, storeCfg); err != nil {
				return err
			}
			entry["url"] = ref[field]
		}
		return nil
	}
	image := func(ref string, index int) (string, error) {
		if strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "http://") {
			return ref, nil
		}
		value, err := dashscopeImageRef(ctx, ref, index, workspace, production)
		if err != nil {
			return "", err
		}
		if strings.HasPrefix(value, "data:") {
			_, value, _ = strings.Cut(value, ",")
		}
		return value, nil
	}
	for index, key := range []string{"image", "image_tail"} {
		if ref, ok := body[key].(string); ok {
			value, err := image(ref, index)
			if err != nil {
				return err
			}
			body[key] = value
		}
	}
	if list, ok := body["image_list"].([]map[string]string); ok {
		for index, entry := range list {
			value, err := image(entry["image_url"], index)
			if err != nil {
				return err
			}
			entry["image_url"] = value
		}
	}
	if list, ok := body["video_list"].([]map[string]string); ok {
		for _, entry := range list {
			ref := entry["video_url"]
			if strings.HasPrefix(ref, "/storage/") {
				if storeCfg == nil {
					return imageEditPrepareError{"可灵参考视频需要公网链接，请先在设置中配置对象存储"}
				}
				value, err := uploadVideoReference(ctx, ref, workspace, production, *storeCfg)
				if err != nil {
					return err
				}
				ref = value
			}
			if !strings.HasPrefix(ref, "https://") && !strings.HasPrefix(ref, "http://") {
				return imageEditPrepareError{"可灵参考视频需要公网链接或已上传到工作区的视频"}
			}
			entry["video_url"] = ref
		}
	}
	return nil
}

func klingMotionPayload(prompt, resolution string, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	sound := "original"
	if audioSet && !audio {
		sound = "off"
	}
	contents := []map[string]string{{"type": "prompt", "text": prompt}}
	if len(images) > 0 {
		contents = append(contents, map[string]string{"type": "image", "url": images[0]})
	}
	if len(videos) > 0 {
		contents = append(contents, map[string]string{"type": "video", "url": videos[0]})
	}
	return map[string]any{"contents": contents, "settings": map[string]any{"character_orientation": "video", "audio": sound, "resolution": strings.ToLower(resolution)}, "options": map[string]any{"watermark_info": map[string]bool{"enabled": watermark}}}
}

// Comfly continues to expose the documented legacy motion-control shape.
func applyKlingMotionChannel(base string, a *videoAdapted) {
	if a.family != "kling" || kling4Model(a.modelID) || !minimaxComflyHost(base) {
		return
	}
	contents, ok := a.payload["contents"].([]map[string]string)
	if !ok {
		return
	}
	settings := a.payload["settings"].(map[string]any)
	body := map[string]any{"model_name": strings.Replace(a.modelID, "kling-video-v", "kling-v", 1), "character_orientation": "video", "mode": "std", "keep_original_sound": "yes"}
	if settings["resolution"] == "1080p" {
		body["mode"] = "pro"
	}
	if settings["audio"] == "off" {
		body["keep_original_sound"] = "no"
	}
	for _, entry := range contents {
		switch entry["type"] {
		case "prompt":
			body["prompt"] = entry["text"]
		case "image":
			body["image_url"] = entry["url"]
		case "video":
			body["video_url"] = entry["url"]
		}
	}
	options := a.payload["options"].(map[string]any)
	body["watermark_info"] = options["watermark_info"]
	a.payload = body
}

// The current Kling API returns a list even when querying one task ID.
func selectKlingTask(data map[string]any, taskID string) map[string]any {
	list, ok := data["data"].([]any)
	if !ok {
		return data
	}
	for _, item := range list {
		task, ok := item.(map[string]any)
		if ok && firstString(task, "id") == taskID {
			return map[string]any{"data": task}
		}
	}
	return map[string]any{}
}
