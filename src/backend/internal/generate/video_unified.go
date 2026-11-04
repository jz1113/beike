package generate

import (
	"encoding/json"
	"strconv"
	"strings"

	"beike.local/cloud/src/backend/internal/gateway"
)

// A route fallback is only safe when the target format can express every input.
func videoAlternateBodies(base string, a *videoAdapted, mode string, nativeH3 map[string]any) map[string]string {
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	var body map[string]any
	var endpoint string
	switch a.family {
	case "seedance":
		body = unifiedSeedanceBody(a.payload, mode)
		if body == nil {
			a.endpoints = a.endpoints[:1]
			a.queries = a.queries[:1]
			return nil
		}
		endpoint = root + "/v2/videos/generations"
	case "wan":
		if !minimaxComflyHost(base) || (a.modelID != "wan3.0-video" && a.modelID != "wan3.0-video-prime") {
			return nil
		}
		input := a.payload["input"].(map[string]any)
		body = map[string]any{"model": a.modelID, "prompt": input["prompt"]}
		for k, v := range a.payload["parameters"].(map[string]any) {
			if k == "ratio" {
				k = "aspect_ratio"
			}
			body[k] = v
		}
		if refs, ok := input["media"]; ok {
			body["media"] = refs
		}
	case "grok-video":
		if !minimaxComflyHost(base) || !strings.EqualFold(a.modelID, "grok-imagine-video-1.5") || mode == "edit" || mode == "extend" || a.payload["reference_audios"] != nil {
			return nil
		}
		body = map[string]any{"model": a.modelID, "prompt": a.payload["prompt"], "aspect_ratio": a.ratio, "seconds": strconv.Itoa(a.duration), "resolution": a.resolution}
		if image, ok := a.payload["image"].(map[string]string); ok {
			body["images"] = []string{image["url"]}
		}
		if last, ok := a.payload["last_frame"].(map[string]string); ok {
			body["last_frame"] = last["url"]
		}
		if refs, ok := a.payload["reference_images"].([]map[string]string); ok {
			urls := make([]string, 0, len(refs))
			for _, ref := range refs {
				urls = append(urls, ref["url"])
			}
			body["reference_images"] = urls
		}
	case "minimax":
		if nativeH3 == nil || minimaxOfficialHost(base) || minimaxMetasoHost(base) || minimaxComflyHost(base) {
			return nil
		}
		endpoint = root + "/minimax/v1/video_generation"
		body = nativeH3
	default:
		return nil
	}
	if endpoint == "" {
		endpoint = root + "/v1/videos"
		a.endpoints = append(a.endpoints, endpoint)
		a.queries = append(a.queries, endpoint+"/{taskId}")
	}
	encoded, _ := json.Marshal(body)
	return map[string]string{endpoint: string(encoded)}
}

func unifiedSeedanceBody(native map[string]any, mode string) map[string]any {
	body := map[string]any{}
	for _, k := range []string{"model", "duration", "resolution", "ratio", "generate_audio", "seed", "watermark"} {
		if value, ok := native[k]; ok {
			body[k] = value
		}
	}
	if task, ok := native["omni_reference_task_type"]; ok {
		body["task_type"] = task
	}
	images := []string{}
	for _, item := range native["content"].([]map[string]any) {
		switch item["type"] {
		case "text":
			body["prompt"] = item["text"]
		case "image_url":
			images = append(images, item["image_url"].(map[string]string)["url"])
		case "video_url":
			if body["video"] != nil {
				return nil
			}
			body["video"] = item["video_url"].(map[string]string)["url"]
		default:
			return nil
		}
	}
	// One or two images alone imply frame roles on the unified endpoint.
	if mode == "omni" && len(images) > 0 && len(images) <= 2 && body["video"] == nil {
		return nil
	}
	if len(images) > 0 {
		body["images"] = images
	}
	return body
}
