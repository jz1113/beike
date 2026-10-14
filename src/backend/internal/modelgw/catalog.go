package modelgw

import "strings"

var imageModelIDs = []string{
	"gpt-image-2.5-flare",
	"openai/gpt-image-2",
	"gpt-image-2.5-sunburst",
	"gpt-image-2",
	"nano-banana-pro",
	"nano-banana",
	"doubao-seedream-4-0-250828",
	"doubao-seedream-4-5-251128",
	"doubao-seedream-5-0-260128",
	"seedream-v5-pro",
	"qwen-image-max",
	"z-image-turbo",
	"qwen-image",
	"qwen-image-edit",
	"midjourney",
	"flux",
	"flux-pro-max",
	"grok-4.1-image",
	"grok-4.2-image",
	"grok-imagine-image-quality",
}

var modelAliases = map[string]string{
	"qwen-image-3":         "qwen-image-max",
	"qwen-image-edit-2509": "qwen-image-edit",
	"mjv7":                 "midjourney",
	"mjv8.1":               "midjourney",
	"mjv8.2":               "midjourney",
}

var videoModelIDs = []string{
	"veo3.1",
	"veo3.1-fast",
	"omni_flash-10s",
	"kling-video-v3",
	"kling-video-v3-omni",
	"kling-video-v2-5-turbo",
	"kling-video-v2-6",
	"doubao-seedance-2-0-260128",
	"doubao-seedance-2-0-fast-260128",
	"doubao-seedance-2.0-mini",
	"doubao-seedance-2.5",
	"sora-2",
	"sora-2-pro",
	"MiniMax-H3",
	"wan3.0-video",
	"grok-imagine-video-1.5",
	"viduq3",
	"viduq3-mix",
	"viduq3-turbo",
	"viduq3-pro",
	"gpt-6-astra",
}

func IsApprovedImage(id string) bool { return approvedModel(id, imageModelIDs) }

func IsApprovedVideo(id string) bool { return approvedModel(id, videoModelIDs) }

func approvedModel(id string, ids []string) bool {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" {
		return false
	}
	known := map[string]struct{}{}
	for _, item := range ids {
		known[strings.ToLower(item)] = struct{}{}
	}
	if _, ok := known[strings.ToLower(trimmed)]; ok {
		return true
	}
	slash := strings.LastIndex(trimmed, "/")
	stripped := trimmed
	if slash >= 0 {
		stripped = trimmed[slash+1:]
	}
	canonical := stripped
	if alias, ok := modelAliases[stripped]; ok {
		canonical = alias
	} else if alias, ok := modelAliases[strings.ToLower(stripped)]; ok {
		canonical = alias
	}
	_, ok := known[strings.ToLower(canonical)]
	return ok
}
