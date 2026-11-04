package generate

import (
	"encoding/json"
	"net/url"
	"strings"
)

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
