package generate

import "strings"

type videoSpec struct {
	durations   []int
	resolutions []string
	aspects     []string
}

var videoRatios = []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}

func videoSpecFor(model string) (videoSpec, bool) {
	spec, ok := videoSpecs[model]
	return spec, ok
}

func videoSpecError(model, mode, resolution, aspect string, duration float64) string {
	spec, ok := videoSpecFor(model)
	if ok && !containsString(spec.resolutions, resolution) {
		return "当前模型不支持所选清晰度，请重新选择"
	}
	if ok && !containsString(spec.aspects, aspect) {
		return "当前模型不支持所选比例，请重新选择"
	}
	if mode == "edit" {
		return ""
	}
	if duration == -1 && (strings.Contains(strings.ToLower(model), "seedance") || strings.HasPrefix(model, "wan3")) {
		return ""
	}
	if !containsInt(videoDurations(model, resolution, mode), int(duration)) || duration != float64(int(duration)) {
		return "当前模型、清晰度与生成方式不支持所选时长，请重新选择"
	}
	return ""
}

func videoDurations(model, resolution, mode string) []int {
	if strings.HasPrefix(model, "veo3.1") && (resolution != "720P" || mode == "omni") {
		return []int{8}
	}
	if spec, ok := videoSpecFor(model); ok {
		if strings.HasPrefix(model, "vidu") && mode == "omni" {
			return filterMin(spec.durations, 3)
		}
		return spec.durations
	}
	return []int{5}
}

func filterMin(values []int, min int) []int {
	out := []int{}
	for _, value := range values {
		if value >= min {
			out = append(out, value)
		}
	}
	return out
}

func containsInt(values []int, target int) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func ints(from, to int) []int {
	out := make([]int, 0, to-from+1)
	for value := from; value <= to; value++ {
		out = append(out, value)
	}
	return out
}

func withAdaptive(values []string) []string {
	return append(append([]string{}, values...), "adaptive")
}

var videoSpecs = map[string]videoSpec{
	"veo3.1":                          {[]int{4, 6, 8}, []string{"720P", "1080P", "4K"}, []string{"16:9", "9:16"}},
	"veo3.1-fast":                     {[]int{4, 6, 8}, []string{"720P", "1080P"}, []string{"16:9", "9:16"}},
	"omni_flash-10s":                  {[]int{10}, []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
	"kling-video-v3":                  {ints(3, 15), []string{"720P", "1080P"}, videoRatios},
	"kling-video-v3-omni":             {ints(3, 15), []string{"720P", "1080P"}, videoRatios},
	"kling-video-v2-5-turbo":          {[]int{5, 10}, []string{"720P", "1080P"}, videoRatios},
	"kling-video-v2-6":                {ints(3, 10), []string{"720P", "1080P"}, videoRatios},
	"doubao-seedance-2-0-260128":      {ints(4, 15), []string{"480P", "720P", "1080P", "4K"}, withAdaptive(videoRatios)},
	"doubao-seedance-2-0-fast-260128": {ints(4, 15), []string{"480P", "720P"}, withAdaptive(videoRatios)},
	"doubao-seedance-2.0-mini":        {ints(4, 15), []string{"480P", "720P"}, withAdaptive(videoRatios)},
	"doubao-seedance-2.5":             {ints(4, 30), []string{"480P", "720P", "1080P"}, withAdaptive(videoRatios)},
	"sora-2":                          {[]int{10, 15}, []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
	"sora-2-pro":                      {[]int{10, 15, 25}, []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
	"MiniMax-H3":                      {ints(4, 15), []string{"720P", "1080P"}, videoRatios},
	"wan3.0-video":                    {ints(2, 30), []string{"480P", "720P", "1080P"}, []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"}},
	"grok-imagine-video-1.5":          {ints(1, 15), []string{"480P", "720P", "1080P"}, []string{"16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"}},
	"viduq3":                          {ints(3, 16), []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
	"viduq3-mix":                      {ints(3, 16), []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
	"viduq3-turbo":                    {ints(1, 16), []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
	"viduq3-pro":                      {ints(1, 16), []string{"720P", "1080P"}, []string{"16:9", "9:16", "1:1"}},
}
