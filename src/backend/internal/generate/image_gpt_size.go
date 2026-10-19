package generate

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

const (
	gptImageMaxPixels     = 8_294_400
	gptImageMinPixels     = 655_360
	gptImageDefaultSize   = "1536x2048"
	gptImageDefaultAspect = "3:4"
)

// normalizeGptImageRequest aligns gpt-image ids, pixel bounds, and quality with the browser adapter.
// Non-gpt models are returned unchanged. An empty quality means the field must be omitted.
func normalizeGptImageRequest(model, size, quality string) (string, string, string) {
	if !isGptImageModel(model) {
		return model, size, quality
	}
	model = sanitizeGptImageModelID(model)
	tier := gptImageQualityTier(quality)
	pixel := resolveGptImagePixelSize(size, model, tier)
	finalSize := scaleSizeToMaxEdge(pixel, maxEdgeForGptImage(model, tier))
	if gptImagePixelBounded(model) {
		finalSize = clampGptImagePixelBudget(finalSize)
	}
	if omitGptImageQuality(model) {
		return model, finalSize, ""
	}
	return model, finalSize, tier
}

func isGptImageModel(model string) bool {
	lower := strings.ToLower(model)
	return strings.Contains(lower, "gpt-image") || strings.Contains(lower, "gpt image")
}

func omitGptImageQuality(model string) bool {
	switch strings.ToLower(model) {
	case "gpt-image-2-2k", "gpt-image-2-4k":
		return true
	default:
		return false
	}
}

func sanitizeGptImageModelID(model string) string {
	trimmed := strings.TrimSpace(model)
	lower := strings.ToLower(trimmed)
	if isGptImage2Display(lower) {
		switch {
		case strings.Contains(lower, "4k"):
			return "gpt-image-2-4k"
		case strings.Contains(lower, "2k"):
			return "gpt-image-2-2k"
		case strings.Contains(lower, "all"), strings.Contains(lower, "全能"):
			return "gpt-image-2-all"
		default:
			return "gpt-image-2"
		}
	}
	if lower == "image2-4k" {
		return "gpt-image-2-4k"
	}
	if legacy := legacyGptImageSuffix(lower); legacy != "" {
		return legacy
	}
	return trimmed
}

func isGptImage2Display(lower string) bool {
	const prefix = "gpt image 2"
	if !strings.HasPrefix(lower, prefix) {
		return false
	}
	rest := lower[len(prefix):]
	return rest == "" || strings.HasPrefix(rest, " ") || strings.HasPrefix(rest, "(") || strings.HasPrefix(rest, "（")
}

func legacyGptImageSuffix(lower string) string {
	parts := strings.Split(lower, "-")
	if len(parts) < 4 || parts[0] != "gpt" || parts[1] != "image" || parts[2] != "2" {
		return ""
	}
	tier := parts[3]
	if tier != "2k" && tier != "4k" {
		return ""
	}
	for _, part := range parts[4:] {
		if part != "2k" && part != "4k" {
			return ""
		}
	}
	return "gpt-image-2-" + tier
}

func normalizeImageQuality(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func gptImageQualityTier(quality string) string {
	switch strings.ToLower(strings.TrimSpace(quality)) {
	case "low", "1k":
		return "low"
	case "high", "4k":
		return "high"
	default:
		return "medium"
	}
}

func gptImagePixelBounded(model string) bool {
	base := strings.ToLower(strings.TrimSpace(model))
	for _, suffix := range []string{"-2k", "-4k", "-all"} {
		if strings.HasSuffix(base, suffix) {
			base = strings.TrimSuffix(base, suffix)
			break
		}
	}
	return base == "gpt-image-2" || base == "gpt-image-2.5-flare" || base == "gpt-image-2.5-sunburst"
}

func maxEdgeForGptImage(model, quality string) int {
	id := strings.ToLower(model)
	switch id {
	case "gpt-image-2-4k":
		return 3840
	case "gpt-image-2-2k":
		return 2048
	}
	if strings.HasPrefix(id, "gpt-image-2.5") || quality == "high" {
		return 3840
	}
	return 2048
}

func resolveGptImagePixelSize(size, model, tier string) string {
	trimmed := strings.TrimSpace(size)
	if width, height, ok := parsePixelSize(trimmed); ok {
		raw := fmt.Sprintf("%dx%d", width, height)
		if strings.Contains(strings.ToLower(model), "gpt-image-2.5") {
			return clampGptImageOfficialPixelSize(raw)
		}
		return raw
	}
	aspect := trimmed
	if _, ok := gptImageSafeSizes[aspect]; !ok {
		aspect = gptImageDefaultAspect
	}
	return gptImageSizeForModel(aspect, model, tier)
}

func gptImageSizeForModel(aspect, model, tier string) string {
	if strings.ToLower(model) == "gpt-image-2-2k" {
		if size, ok := gptImageSuffix2K[aspect]; ok {
			return size
		}
		return gptImageSuffix2K[gptImageDefaultAspect]
	}
	sizes := gptImageSafeSizes[aspect]
	switch tier {
	case "low":
		return sizes[0]
	case "high":
		return sizes[2]
	default:
		return sizes[1]
	}
}

func scaleSizeToMaxEdge(size string, maxEdge int) string {
	width, height, ok := parsePixelSize(size)
	if !ok {
		return gptImageDefaultSize
	}
	edge := max(width, height)
	if edge > maxEdge && edge > 0 {
		scale := float64(maxEdge) / float64(edge)
		width = roundToMultiple(float64(width)*scale, 16)
		height = roundToMultiple(float64(height)*scale, 16)
	} else {
		width = roundToMultiple(float64(width), 16)
		height = roundToMultiple(float64(height), 16)
	}
	return fmt.Sprintf("%dx%d", width, height)
}

func clampGptImagePixelBudget(size string) string {
	width, height, ok := parsePixelSize(size)
	if !ok || width < 1 || height < 1 {
		return size
	}
	pixels := width * height
	switch {
	case pixels > gptImageMaxPixels:
		scale := math.Sqrt(float64(gptImageMaxPixels) / float64(pixels))
		width = int(math.Floor(float64(width)*scale/16)) * 16
		height = int(math.Floor(float64(height)*scale/16)) * 16
	case pixels < gptImageMinPixels:
		scale := math.Sqrt(float64(gptImageMinPixels) / float64(pixels))
		width = int(math.Ceil(float64(width)*scale/16)) * 16
		height = int(math.Ceil(float64(height)*scale/16)) * 16
	}
	if width < 16 {
		width = 16
	}
	if height < 16 {
		height = 16
	}
	return fmt.Sprintf("%dx%d", width, height)
}

func clampGptImageOfficialPixelSize(pixelSize string) string {
	width, height, ok := parsePixelSize(pixelSize)
	if !ok {
		return pixelSize
	}
	width = snap16(math.Min(3840, float64(width)))
	height = snap16(math.Min(3840, float64(height)))
	longEdge := max(width, height)
	shortEdge := min(width, height)
	if shortEdge > 0 && float64(longEdge)/float64(shortEdge) > 3 {
		nextShort := snap16(math.Ceil(float64(longEdge) / 3))
		if width >= height {
			height = nextShort
		} else {
			width = nextShort
		}
	}
	pixels := width * height
	if pixels < gptImageMinPixels {
		scale := math.Sqrt(float64(gptImageMinPixels) / float64(pixels))
		width = snap16(float64(width) * scale)
		height = snap16(float64(height) * scale)
		pixels = width * height
	}
	if pixels > gptImageMaxPixels {
		scale := math.Sqrt(float64(gptImageMaxPixels) / float64(pixels))
		width = snap16(float64(width) * scale)
		height = snap16(float64(height) * scale)
	}
	width = min(3840, width)
	height = min(3840, height)
	return fmt.Sprintf("%dx%d", width, height)
}

func parsePixelSize(size string) (int, int, bool) {
	clean := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(size), " ", ""))
	widthText, heightText, ok := strings.Cut(clean, "x")
	if !ok || !digitsOnly(widthText) || !digitsOnly(heightText) {
		return 0, 0, false
	}
	width, errW := strconv.Atoi(widthText)
	height, errH := strconv.Atoi(heightText)
	if errW != nil || errH != nil || width < 1 || height < 1 {
		return 0, 0, false
	}
	return width, height, true
}

func digitsOnly(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func roundToMultiple(value float64, multiple int) int {
	rounded := int(math.Round(value/float64(multiple))) * multiple
	if rounded < multiple {
		return multiple
	}
	return rounded
}

func snap16(value float64) int {
	return roundToMultiple(value, 16)
}

var gptImageSafeSizes = map[string][3]string{
	"smart": {"1024x1024", "2048x2048", "3072x4096"},
	"21:9":  {"1536x640", "2048x864", "3840x1632"},
	"16:9":  {"1536x864", "2048x1152", "3840x2160"},
	"3:2":   {"1536x1024", "2048x1360", "3840x2560"},
	"4:3":   {"1280x960", "2048x1536", "4096x3072"},
	"1:1":   {"1024x1024", "2048x2048", "3072x3072"},
	"3:4":   {"960x1280", "1536x2048", "3072x4096"},
	"2:3":   {"1024x1536", "1360x2048", "2160x3240"},
	"9:16":  {"864x1536", "1152x2048", "2160x3840"},
}

var gptImageSuffix2K = map[string]string{
	"smart": "1536x1536",
	"21:9":  "1536x640",
	"16:9":  "1536x864",
	"3:2":   "1536x1024",
	"4:3":   "1536x1152",
	"1:1":   "1536x1536",
	"3:4":   "1536x2048",
	"2:3":   "1024x1536",
	"9:16":  "1152x2048",
}
