package avatar

import (
	"regexp"
	"strings"
)

type DriverFamily string

const (
	FamilyKling      DriverFamily = "kling"
	FamilyOmniHuman  DriverFamily = "omnihuman"
	FamilyWanx       DriverFamily = "wanx"
	FamilyHedra      DriverFamily = "hedra"
	FamilyLatentSync DriverFamily = "latentsync"
	FamilyGeneric    DriverFamily = "generic"
)

type DriverInput string

const (
	InputImage  DriverInput = "image"
	InputVideo  DriverInput = "video"
	InputEither DriverInput = "either"
)

type DriverSpec struct {
	Family DriverFamily
	Input  DriverInput
}

type driverRule struct {
	spec DriverSpec
	test *regexp.Regexp
}

var driverRules = []driverRule{
	{DriverSpec{FamilyOmniHuman, InputImage}, regexp.MustCompile(`omnihuman|omni-human`)},
	{DriverSpec{FamilyKling, InputEither}, regexp.MustCompile(`kling.*(lip|avatar|ident)|(lip|avatar|ident).*kling`)},
	{DriverSpec{FamilyWanx, InputEither}, regexp.MustCompile(`wanx-avatar|videoretalk|wan2\.2-s2v|emo-v|emo-detect`)},
	{DriverSpec{FamilyHedra, InputImage}, regexp.MustCompile(`hedra`)},
	{DriverSpec{FamilyLatentSync, InputVideo}, regexp.MustCompile(`latentsync|musetalk`)},
	{DriverSpec{FamilyGeneric, InputEither}, regexp.MustCompile(`lip-?sync|digital-human|口型|数字人`)},
}

func ClassifyDriver(model string) (DriverSpec, bool) {
	id := strings.ToLower(strings.TrimSpace(model))
	if id == "" {
		return DriverSpec{}, false
	}
	for _, rule := range driverRules {
		if rule.test.MatchString(id) {
			return rule.spec, true
		}
	}
	return DriverSpec{}, false
}

func mediaIsImage(raw string) bool {
	path := strings.ToLower(strings.Split(raw, "?")[0])
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"} {
		if strings.HasSuffix(path, ext) {
			return true
		}
	}
	return false
}

func driverPayload(spec DriverSpec, model, mediaURL, audioURL, ratio string, image bool) map[string]any {
	switch spec.Family {
	case FamilyKling:
		input := map[string]any{"audio_url": audioURL, "mode": "std"}
		if image {
			input["image_url"] = mediaURL
		} else {
			input["video_url"] = mediaURL
		}
		return map[string]any{"model": model, "input": input, "aspect_ratio": ratio}
	case FamilyOmniHuman:
		return map[string]any{"model": model, "image_url": mediaURL, "audio_url": audioURL, "aspect_ratio": ratio}
	case FamilyWanx:
		input := map[string]any{"audio_url": audioURL}
		if image {
			input["image_url"] = mediaURL
		} else {
			input["video_url"] = mediaURL
		}
		return map[string]any{"model": model, "input": input, "parameters": map[string]any{"resolution": "720P"}}
	case FamilyHedra:
		return map[string]any{"model": model, "image_url": mediaURL, "audio_url": audioURL, "aspect_ratio": ratio}
	case FamilyLatentSync:
		return map[string]any{"model": model, "video_url": mediaURL, "audio_url": audioURL}
	default:
		body := map[string]any{"model": model, "audioUrl": audioURL, "aspectRatio": ratio}
		if image {
			body["avatarImageUrl"] = mediaURL
		} else {
			body["avatarVideoUrl"] = mediaURL
		}
		return body
	}
}

func driverSubmitPaths(family DriverFamily) []string {
	switch family {
	case FamilyKling:
		return []string{"/kling/v1/videos/lip-sync", "/v1/videos/lip-sync"}
	case FamilyOmniHuman:
		return []string{"/v1/videos/omnihuman", "/jimeng/v1/omnihuman"}
	case FamilyWanx:
		return []string{"/api/v1/services/aigc/image2video/video-synthesis", "/v1/avatar/generations"}
	case FamilyHedra:
		return []string{"/hedra/v1/generations", "/v1/avatar/generations"}
	case FamilyLatentSync:
		return []string{"/fal/latentsync", "/v1/videos/lip-sync"}
	default:
		return []string{"/v1/avatar/generations", "/v1/videos/lip-sync"}
	}
}

func driverPollPaths(family DriverFamily, taskID string) []string {
	switch family {
	case FamilyKling:
		return []string{"/kling/v1/videos/lip-sync/" + taskID, "/v1/videos/" + taskID}
	case FamilyOmniHuman:
		return []string{"/v1/videos/omnihuman/" + taskID, "/v1/videos/" + taskID}
	case FamilyWanx:
		return []string{"/api/v1/tasks/" + taskID, "/v1/avatar/tasks/" + taskID}
	case FamilyHedra:
		return []string{"/hedra/v1/generations/" + taskID, "/v1/avatar/tasks/" + taskID}
	case FamilyLatentSync:
		return []string{"/fal/latentsync/" + taskID, "/v1/videos/" + taskID}
	default:
		return []string{"/v1/avatar/tasks/" + taskID, "/v1/videos/" + taskID}
	}
}
