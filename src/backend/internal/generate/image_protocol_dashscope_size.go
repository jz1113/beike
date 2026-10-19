package generate

import (
	"math"
	"strconv"
	"strings"
)

type dashscopeLimits struct {
	maxTier int
	maxEdge int
	minEdge int
}

func dashscopePixelSize(model, size, quality string) string {
	limits := dashscopeModelLimits(model)
	tier := dashscopeQualityTier(quality)
	if tier > limits.maxTier {
		tier = limits.maxTier
	}
	ratio := dashscopeNearestRatio(size)
	width, height := dashscopeTierSize(ratio, tier)
	width, height = fitDashscopeSize(width, height, limits.maxEdge, limits.minEdge)
	return strconv.Itoa(width) + "*" + strconv.Itoa(height)
}

func dashscopeModelLimits(model string) dashscopeLimits {
	id := strings.ToLower(model)
	switch {
	case strings.Contains(id, "wan2.7-image-pro"):
		return dashscopeLimits{maxTier: 4, maxEdge: 4096, minEdge: 768}
	case strings.Contains(id, "wan2.7-image"):
		return dashscopeLimits{maxTier: 2, maxEdge: 2048, minEdge: 768}
	case strings.Contains(id, "wan2.6-image"):
		return dashscopeLimits{maxTier: 1, maxEdge: 1280, minEdge: 768}
	case strings.Contains(id, "wan2.6-t2i"):
		return dashscopeLimits{maxTier: 1, maxEdge: 1696, minEdge: 768}
	default:
		return dashscopeLimits{maxTier: 2, maxEdge: 2048, minEdge: 512}
	}
}

func dashscopeQualityTier(quality string) int {
	switch strings.ToLower(strings.TrimSpace(quality)) {
	case "low", "1k":
		return 1
	case "high", "4k", "hd", "xhigh", "max":
		return 4
	default:
		return 2
	}
}

func dashscopeNearestRatio(size string) string {
	text := strings.ToLower(strings.TrimSpace(size))
	text = strings.NewReplacer("×", "x", "*", "x", " ", "").Replace(text)
	known := []string{"21:9", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "1:1"}
	for _, ratio := range known {
		if text == ratio {
			return ratio
		}
	}
	width, height, ok := dashscopePixelPair(text)
	if !ok || width <= 0 || height <= 0 {
		return "1:1"
	}
	target := float64(width) / float64(height)
	best := "1:1"
	bestGap := math.MaxFloat64
	for _, ratio := range known {
		parts := strings.Split(ratio, ":")
		left, _ := strconv.ParseFloat(parts[0], 64)
		right, _ := strconv.ParseFloat(parts[1], 64)
		gap := math.Abs(target - left/right)
		if gap < bestGap {
			bestGap = gap
			best = ratio
		}
	}
	return best
}

func dashscopePixelPair(size string) (int, int, bool) {
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	width, errW := strconv.Atoi(parts[0])
	height, errH := strconv.Atoi(parts[1])
	if errW != nil || errH != nil {
		return 0, 0, false
	}
	return width, height, true
}

func dashscopeTierSize(ratio string, tier int) (int, int) {
	table := map[string]map[int][2]int{
		"1:1":  {1: {1280, 1280}, 2: {2048, 2048}, 4: {4096, 4096}},
		"16:9": {1: {1696, 960}, 2: {2688, 1536}, 4: {4096, 2304}},
		"9:16": {1: {960, 1696}, 2: {1536, 2688}, 4: {2304, 4096}},
		"4:3":  {1: {1472, 1104}, 2: {2368, 1728}, 4: {4096, 3072}},
		"3:4":  {1: {1104, 1472}, 2: {1728, 2368}, 4: {3072, 4096}},
		"3:2":  {1: {1536, 1024}, 2: {2496, 1664}, 4: {3840, 2560}},
		"2:3":  {1: {1024, 1536}, 2: {1664, 2496}, 4: {2560, 3840}},
		"21:9": {1: {1792, 768}, 2: {2688, 1152}, 4: {4096, 1760}},
	}
	if sizes, ok := table[ratio]; ok {
		if size, ok := sizes[tier]; ok {
			return size[0], size[1]
		}
	}
	edge := map[int]int{1: 1280, 2: 2048, 4: 4096}[tier]
	if edge == 0 {
		edge = 2048
	}
	return edge, edge
}

func fitDashscopeSize(width, height, maxEdge, minEdge int) (int, int) {
	if width < 1 || height < 1 {
		return maxEdge, maxEdge
	}
	longEdge := width
	if height > longEdge {
		longEdge = height
	}
	if longEdge > maxEdge {
		scale := float64(maxEdge) / float64(longEdge)
		width = roundDashscope(float64(width) * scale)
		height = roundDashscope(float64(height) * scale)
	}
	if width > maxEdge {
		width = maxEdge
	}
	if height > maxEdge {
		height = maxEdge
	}
	if width < minEdge {
		width = minEdge
	}
	if height < minEdge {
		height = minEdge
	}
	return width, height
}

func roundDashscope(value float64) int {
	rounded := int(math.Round(value/16) * 16)
	if rounded < 16 {
		return 16
	}
	return rounded
}
