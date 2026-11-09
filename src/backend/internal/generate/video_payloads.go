package generate

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

func viduResolution(resolution string) string {
	upper := strings.ToUpper(strings.TrimSpace(resolution))
	switch {
	case strings.Contains(upper, "540"):
		return "540p"
	case strings.Contains(upper, "1080"):
		return "1080p"
	case strings.Contains(upper, "720"):
		return "720p"
	case strings.Contains(upper, "4K"):
		return "4K"
	case strings.Contains(upper, "2K"):
		return "2K"
	default:
		return "720p"
	}
}

func grokResolution(resolution string) string {
	upper := strings.ToUpper(strings.TrimSpace(resolution))
	switch {
	case strings.Contains(upper, "1080"):
		return "1080p"
	case strings.Contains(upper, "720"):
		return "720p"
	default:
		return "480p"
	}
}

func viduOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images []string, audio, audioSet bool) map[string]any {
	body := map[string]any{
		"model": model, "prompt": prompt, "duration": duration, "resolution": viduResolution(resolution),
	}
	if audioSet {
		body["audio"] = audio
	}
	switch mode {
	case "first_frame":
		if len(images) > 0 {
			body["images"] = []string{images[0]}
		}
	case "first_last_frame":
		if len(images) >= 2 {
			body["images"] = []string{images[0], images[len(images)-1]}
		}
	case "text":
		body["aspect_ratio"] = ratio
	default:
		body["images"] = images
		body["aspect_ratio"] = ratio
	}
	return body
}

// Vidu accepts accessible URLs or image data URIs, never browser-local storage
// paths. Resolve in place so image numbers in the reviewed prompt stay stable.
func prepareViduImageReferences(ctx context.Context, body map[string]any, workspace string, production bool) error {
	images, _ := body["images"].([]string)
	resolved := make([]string, len(images))
	for index, ref := range images {
		ref = strings.TrimSpace(ref)
		if strings.HasPrefix(ref, "//") {
			ref = "https:" + ref
		}
		converted, err := dashscopeImageRef(ctx, ref, index, workspace, production)
		if err != nil {
			return err
		}
		if converted == "" {
			return imageEditPrepareError{"参考图地址为空"}
		}
		resolved[index] = converted
	}
	if len(images) > 0 {
		body["images"] = resolved
	}
	// Measure the final JSON, including prompt and already-prepared sound URLs.
	// The provider's 20MB cap also applies to the overhead of Base64 encoding.
	encoded, err := json.Marshal(body)
	if err != nil {
		return err
	}
	if len(encoded) > 20<<20 {
		return imageEditPrepareError{"Vidu 请求总大小超过 20MB，请减少参考图片数量或压缩图片后重试"}
	}
	return nil
}

func prepareViduAudioReferences(ctx context.Context, root string, body map[string]any, workspace string, production bool, cfg *storage.ObjectConfig) error {
	sounds, _ := body["sounds"].([]string)
	if len(sounds) == 0 {
		return nil
	}
	resolved := make([]string, len(sounds))
	for index, ref := range sounds {
		ref = strings.TrimSpace(ref)
		if strings.HasPrefix(ref, "/storage/") {
			if cfg == nil {
				return imageEditPrepareError{"当前未配置对象存储，Vidu 参考音频需要公网可访问链接，请先完成对象存储配置"}
			}
			path, err := localReferenceAudioPath(ref, workspace, production)
			if err != nil {
				return err
			}
			data, err := prepareLocalViduReferenceAudio(ctx, root, path)
			if err != nil {
				return err
			}
			key := storage.ObjectKeyWithConfig(*cfg, "refs", "mp3", "")
			if err := storage.Objects.Put(ctx, *cfg, key, "audio/mpeg", data); err != nil {
				return imageEditPrepareError{"对象存储上传参考音频失败，请检查存储配置"}
			}
			ref, err = storage.ReferenceObjectURL(ctx, *cfg, key)
			if err != nil {
				return imageEditPrepareError{"参考音频已上传，但无法生成访问链接，请检查存储配置"}
			}
		}
		parsed, err := url.Parse(ref)
		if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Scheme != "https" && parsed.Scheme != "http" {
			return imageEditPrepareError{"Vidu 参考音频需要公网 HTTP(S) 链接或当前工作区音频"}
		}
		resolved[index] = ref
	}
	body["sounds"] = resolved
	return nil
}

// Vidu accepts MP3 only; preserve the voice-library original and its timing.
func prepareLocalViduReferenceAudio(ctx context.Context, root, path string) ([]byte, error) {
	converted, _, _, err := transcodeReferenceAudio(ctx, root, path, "mp3", 0)
	return converted, err
}

func flatVideoPayload(model, prompt, ratio, resolution string, duration int, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	body := map[string]any{
		"model": model, "prompt": prompt, "duration": duration, "ratio": ratio, "aspect_ratio": ratio,
		"resolution": resolution, "watermark": watermark, "size": videoPixelSize(ratio, resolution),
	}
	if audioSet && audio {
		body["audio"] = true
		body["generate_audio"] = true
	}
	if len(images) > 0 {
		body["images"] = images
		body["image"] = images[0]
	}
	if len(videos) > 0 {
		body["videos"] = videos
	}
	return body
}

func wanResolution(resolution string) string {
	upper := strings.ToUpper(strings.TrimSpace(resolution))
	switch {
	case strings.Contains(upper, "480"):
		return "480P"
	case strings.Contains(upper, "720"):
		return "720P"
	default:
		return "1080P"
	}
}

func wanRatio(ratio string, hasMedia bool) string {
	switch ratio {
	case "adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9":
		return ratio
	default:
		if hasMedia {
			return "adaptive"
		}
		return "16:9"
	}
}

func wanOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	media := make([]map[string]string, 0, len(images)+len(videos))
	switch mode {
	case "first_last_frame":
		if len(images) > 0 {
			media = append(media, map[string]string{"type": "first_frame", "url": images[0]})
		}
		if len(images) > 1 {
			media = append(media, map[string]string{"type": "last_frame", "url": images[len(images)-1]})
		}
	case "first_frame":
		if len(images) > 0 {
			media = append(media, map[string]string{"type": "first_frame", "url": images[0]})
		}
	default:
		limitVideos := videos
		if len(limitVideos) > 5 {
			limitVideos = limitVideos[:5]
		}
		for _, item := range limitVideos {
			media = append(media, map[string]string{"type": "reference_video", "url": item})
		}
		limitImages := images
		if len(limitImages) > 10 {
			limitImages = limitImages[:10]
		}
		for _, item := range limitImages {
			media = append(media, map[string]string{"type": "reference_image", "url": item})
		}
	}
	input := map[string]any{"prompt": prompt}
	if len(media) > 0 {
		input["media"] = media
	}
	if duration != -1 {
		if duration < 2 {
			duration = 2
		}
		if duration > 30 {
			duration = 30
		}
	}
	spoken := true
	if audioSet {
		spoken = audio
	}
	return map[string]any{
		"model": model,
		"input": input,
		"parameters": map[string]any{
			"resolution": wanResolution(resolution), "ratio": wanRatio(ratio, len(media) > 0), "duration": duration,
			"audio": spoken, "prompt_extend": true, "watermark": watermark,
		},
	}
}

func prepareWanMedia(ctx context.Context, root string, body map[string]any, workspace string, production bool, storeCfg *storage.ObjectConfig) error {
	input, _ := body["input"].(map[string]any)
	if input == nil {
		return nil
	}
	media, _ := input["media"].([]map[string]string)
	if len(media) == 0 {
		return nil
	}
	imageIndex := 0
	for index, item := range media {
		raw := strings.TrimSpace(item["url"])
		if strings.HasPrefix(raw, "//") {
			raw = "https:" + raw
		}
		switch item["type"] {
		case "first_frame", "last_frame", "reference_image":
			converted, err := dashscopeImageRef(ctx, raw, imageIndex, workspace, production)
			if err != nil {
				return err
			}
			if converted == "" {
				return imageEditPrepareError{"参考图地址为空"}
			}
			media[index]["url"] = converted
			imageIndex++
		case "reference_video":
			if strings.HasPrefix(raw, "/storage/") {
				if storeCfg == nil {
					return imageEditPrepareError{"当前未配置对象存储（OSS/R2/COS/S3）。万相参考视频需要公网可访问链接，请在【设置 -> 对象存储】中完成配置后重试。"}
				}
				uploaded, err := uploadVideoReference(ctx, raw, workspace, production, *storeCfg)
				if err != nil {
					return err
				}
				raw = uploaded
			}
			if !strings.HasPrefix(strings.ToLower(raw), "https://") && !strings.HasPrefix(strings.ToLower(raw), "http://") {
				return imageEditPrepareError{"万相参考视频需要公网可访问链接或当前工作区的已上传视频"}
			}
			media[index]["url"] = raw
		case "reference_audio":
			resolved, err := resolveWanAudioRef(ctx, root, raw, workspace, production, storeCfg)
			if err != nil {
				return err
			}
			media[index]["url"] = resolved
		default:
			if !strings.HasPrefix(raw, "https://") && !strings.HasPrefix(raw, "http://") {
				return imageEditPrepareError{"参考素材需要可访问的公网地址"}
			}
			media[index]["url"] = raw
		}
	}
	input["media"] = media
	return nil
}

func seedance25(model string) bool {
	id := strings.ToLower(model)
	return strings.Contains(id, "seedance-2.5") || strings.Contains(id, "seedance-2-5")
}

func seedanceOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	content := make([]map[string]any, 0, 1+len(images)+len(videos))
	if strings.TrimSpace(prompt) != "" {
		content = append(content, map[string]any{"type": "text", "text": strings.TrimSpace(prompt)})
	}
	framed := mode == "first_frame" || mode == "first_last_frame"
	if framed {
		if len(images) > 0 {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": images[0]}, "role": "first_frame"})
		}
		if mode == "first_last_frame" && len(images) > 1 {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": images[len(images)-1]}, "role": "last_frame"})
		}
	} else {
		for _, item := range images {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": item}, "role": "reference_image"})
		}
	}
	for _, item := range videos {
		content = append(content, map[string]any{"type": "video_url", "video_url": map[string]string{"url": item}, "role": "reference_video"})
	}
	if mode == "edit" {
		duration = -1
	}
	locked := seedance25(model) && (framed || mode == "edit" || mode == "extend")
	chosenRatio := ratio
	if locked {
		chosenRatio = "adaptive"
	}
	body := map[string]any{
		"model": model, "content": content, "duration": duration, "ratio": chosenRatio, "resolution": resolution,
	}
	if audioSet {
		body["generate_audio"] = audio
	}
	if watermark {
		body["watermark"] = true
	}
	if mode == "edit" || mode == "extend" {
		body["omni_reference_task_type"] = mode
	}
	return body
}

func klingOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images []string, audio, audioSet, watermark bool) map[string]any {
	quality := "std"
	upper := strings.ToUpper(resolution)
	switch {
	case strings.Contains(upper, "4K"):
		quality = "4k"
	case strings.Contains(upper, "1080"):
		quality = "pro"
	}
	body := map[string]any{
		"prompt": prompt, "duration": strconv.Itoa(duration), "aspect_ratio": ratio, "watermark_info": map[string]bool{"enabled": watermark},
		"mode": quality, "model_name": strings.Replace(model, "kling-video-v", "kling-v", 1), "cfg_scale": 0.5,
	}
	if strings.Contains(model, "v3") || strings.Contains(model, "v2-6") {
		sound := "on"
		if audioSet && !audio {
			sound = "off"
		}
		body["sound"] = sound
	}
	omniModel := strings.Contains(strings.ToLower(model), "omni")
	if omniModel {
		list := make([]map[string]string, 0, len(images))
		for index, item := range images {
			entry := map[string]string{"image_url": item}
			if mode == "first_frame" && index == 0 {
				entry["type"] = "first_frame"
			}
			if mode == "first_last_frame" && index == 0 {
				entry["type"] = "first_frame"
			}
			if mode == "first_last_frame" && index == len(images)-1 {
				entry["type"] = "end_frame"
			}
			list = append(list, entry)
		}
		body["image_list"] = list
		return body
	}
	if mode == "first_last_frame" && len(images) > 1 {
		body["image"] = images[0]
		body["image_tail"] = images[len(images)-1]
	} else if len(images) > 0 {
		body["image"] = images[0]
	}
	return body
}

func minimaxOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	if minimaxH3(model) {
		return minimaxH3Payload(model, prompt, mode, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	}
	body := flatVideoPayload(model, prompt, ratio, resolution, duration, images, nil, audio, audioSet && audio, watermark)
	switch mode {
	case "text":
		body["mode"] = "text-to-video"
	case "first_frame":
		body["mode"] = "image-to-video"
	case "first_last_frame":
		body["mode"] = "first-last-frame"
	default:
		body["mode"] = "reference-to-video"
	}
	if strings.Contains(strings.ToLower(resolution), "1080") {
		body["resolution"] = "2k"
	} else {
		body["resolution"] = "768P"
	}
	if len(images) > 0 {
		body["imageUrls"] = images
		if ratio == "" || ratio == "adaptive" {
			body["aspect_ratio"] = "adaptive"
			body["ratio"] = "adaptive"
		}
	}
	if strings.Contains(strings.ToLower(model), "h3") {
		body["seconds"] = duration
	}
	if audioSet && !audio {
		text, _ := body["prompt"].(string)
		if !strings.Contains(text, "silent") && !strings.Contains(text, "无声") && !strings.Contains(text, "静音") {
			body["prompt"] = strings.TrimSpace(text) + " (silent video, no sound)"
		}
	}
	return body
}

func grokOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string) map[string]any {
	if mode == "edit" || mode == "extend" {
		body := map[string]any{"model": model, "prompt": prompt}
		if len(videos) > 0 {
			body["video"] = map[string]string{"url": videos[0]}
		}
		if mode == "extend" {
			if duration == 0 {
				duration = 6
			}
			body["duration"] = duration
		}
		return body
	}
	body := map[string]any{
		"model": model, "prompt": prompt, "duration": duration,
		"aspect_ratio": ratio, "resolution": grokResolution(resolution),
	}
	switch mode {
	case "first_frame":
		if len(images) > 0 {
			body["image"] = map[string]string{"url": images[0]}
		}
	case "first_last_frame":
		if len(images) > 0 {
			body["image"] = map[string]string{"url": images[0]}
		}
		if len(images) > 1 {
			body["last_frame"] = map[string]string{"url": images[len(images)-1]}
		}
	case "omni":
		refs := make([]map[string]string, 0, len(images))
		for _, item := range images {
			refs = append(refs, map[string]string{"url": item})
		}
		if len(refs) > 0 {
			body["reference_images"] = refs
		}
	}
	return body
}
