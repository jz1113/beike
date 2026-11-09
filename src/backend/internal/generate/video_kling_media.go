package generate

import (
	"beike.local/cloud/src/backend/internal/platform/storage"
	"context"
	"strings"
)

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
		refs := map[string]any{}
		for _, entry := range contents {
			if entry["type"] == "image" {
				refs["image_list"] = []map[string]string{{"image_url": entry["url"]}}
			}
			if entry["type"] == "video" {
				refs["video_list"] = []map[string]string{{"video_url": entry["url"]}}
			}
		}
		if err := prepareKlingMedia(ctx, root, refs, workspace, production, storeCfg); err != nil {
			return err
		}
		for _, entry := range contents {
			if entry["type"] == "image" {
				entry["url"] = refs["image_list"].([]map[string]string)[0]["image_url"]
			}
			if entry["type"] == "video" {
				entry["url"] = refs["video_list"].([]map[string]string)[0]["video_url"]
			}
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
	if a.family != "kling" || !minimaxComflyHost(base) {
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
