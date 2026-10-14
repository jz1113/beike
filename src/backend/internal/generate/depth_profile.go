package generate

import "strconv"

type depthProfile struct {
	modelID    string
	maxWidthPx int
	videoCrf   int
	preset     string
}

func resolveDepthStyle(style, colormap string) string {
	switch style {
	case "mocap", "turbo", "raw":
		return style
	}
	if colormap == "turbo" {
		return "turbo"
	}
	return "mocap"
}

func resolveDepthQuality(value string) string {
	switch value {
	case "fast", "standard", "high":
		return value
	}
	return "standard"
}

func depthQualityProfile(quality string) depthProfile {
	switch resolveDepthQuality(quality) {
	case "fast":
		return depthProfile{modelID: "depth-anything/Depth-Anything-V2-Small-hf", maxWidthPx: 960, videoCrf: 23, preset: "medium"}
	case "high":
		return depthProfile{modelID: "depth-anything/Depth-Anything-V2-Large-hf", maxWidthPx: 2560, videoCrf: 15, preset: "slow"}
	default:
		return depthProfile{modelID: "depth-anything/Depth-Anything-V2-Base-hf", maxWidthPx: 1280, videoCrf: 20, preset: "medium"}
	}
}

func formatDepthProgress(frame, total int) string {
	if total <= 0 {
		return "5%"
	}
	pct := int(float64(frame)/float64(total)*90) + 5
	if pct < 5 {
		pct = 5
	}
	if pct > 99 {
		pct = 99
	}
	return strconv.Itoa(pct) + "%"
}
