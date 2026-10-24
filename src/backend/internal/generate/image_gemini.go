package generate

import (
	"math"
	"strconv"
	"strings"
)

const geminiMaxReferenceImages = 14

var geminiStandardRatios = []string{
	"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
}

var geminiExtendedRatios = []string{
	"1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
}

var gemini3OfficialSizes = map[string][4]string{
	"1:1":  {"512x512", "1024x1024", "2048x2048", "4096x4096"},
	"1:4":  {"256x1024", "512x2048", "1024x4096", "2048x8192"},
	"1:8":  {"192x1536", "384x3072", "768x6144", "1536x12288"},
	"2:3":  {"424x632", "848x1264", "1696x2528", "3392x5056"},
	"3:2":  {"632x424", "1264x848", "2528x1696", "5056x3392"},
	"3:4":  {"448x600", "896x1200", "1792x2400", "3584x4800"},
	"4:1":  {"1024x256", "2048x512", "4096x1024", "8192x2048"},
	"4:3":  {"600x448", "1200x896", "2400x1792", "4800x3584"},
	"4:5":  {"464x576", "928x1152", "1856x2304", "3712x4608"},
	"5:4":  {"576x464", "1152x928", "2304x1856", "4608x3712"},
	"8:1":  {"1536x192", "3072x384", "6144x768", "12288x1536"},
	"9:16": {"384x688", "768x1376", "1536x2752", "3072x5504"},
	"16:9": {"688x384", "1376x768", "2752x1536", "5504x3072"},
	"21:9": {"792x168", "1584x672", "3168x1344", "6336x2688"},
}

var gemini25OfficialSizes = map[string]string{
	"1:1":  "1024x1024",
	"2:3":  "832x1248",
	"3:2":  "1248x832",
	"3:4":  "864x1184",
	"4:3":  "1184x864",
	"4:5":  "896x1152",
	"5:4":  "1152x896",
	"9:16": "768x1344",
	"16:9": "1344x768",
	"21:9": "1536x672",
}

func isGeminiImageModel(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	if id == "" {
		return false
	}
	return strings.Contains(id, "nano-banana") || strings.Contains(id, "nanobanana") || strings.Contains(id, "gemini")
}

func geminiLiteImageModel(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	return strings.Contains(id, "flash-lite") || strings.Contains(id, "banana-2-lite") || strings.Contains(id, "banana-lite")
}

func geminiLegacy25ImageModel(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	if strings.Contains(id, "2.5-flash-image") {
		return true
	}
	if !strings.Contains(id, "nano-banana") && !strings.Contains(id, "nanobanana") {
		return false
	}
	for _, token := range []string{"2.1", "3.1", "pro", "lite", "-hd", "-1k", "-2k", "-4k"} {
		if strings.Contains(id, token) {
			return false
		}
	}
	return id != "nano-banana-2" && !strings.HasPrefix(id, "nano-banana-2-")
}

func geminiSupportsExtendedRatios(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	if !isGeminiImageModel(id) || geminiLiteImageModel(id) || strings.Contains(id, "pro") || geminiLegacy25ImageModel(id) {
		return false
	}
	return strings.Contains(id, "2.1") || strings.Contains(id, "3.1-flash") || id == "nano-banana-2" || strings.HasPrefix(id, "nano-banana-2-")
}

func geminiSupportedRatios(model string) []string {
	if geminiSupportsExtendedRatios(model) {
		return geminiExtendedRatios
	}
	return geminiStandardRatios
}

func geminiSupports512px(model string) bool {
	id := strings.ToLower(strings.TrimSpace(model))
	if strings.Contains(id, "2.1") || geminiLiteImageModel(id) || strings.Contains(id, "pro") || geminiLegacy25ImageModel(id) {
		return false
	}
	return strings.Contains(id, "3.1-flash-image") || id == "nano-banana-2" || strings.HasPrefix(id, "nano-banana-2-")
}

func geminiSendsImageSize(model string) bool {
	return isGeminiImageModel(model) && !geminiLegacy25ImageModel(model)
}

func resolveGeminiAspectRatio(model, size, aspectRatio string) string {
	candidates := geminiSupportedRatios(model)
	raw := strings.TrimSpace(aspectRatio)
	if raw == "" {
		raw = strings.TrimSpace(size)
	}
	if raw == "" {
		return ""
	}
	lower := strings.ToLower(raw)
	if lower == "auto" || lower == "default" || lower == "smart" {
		return ""
	}
	cleanPixel := strings.NewReplacer(" ", "", "×", "x", "*", "x").Replace(lower)
	if matched := geminiRatioFromOfficialPixel(cleanPixel); matched != "" {
		if ratioListContains(candidates, matched) {
			return matched
		}
		if w, h, ok := parseColonPair(matched); ok {
			return closestRatioInList(w/h, candidates)
		}
	}
	normalizedColon := strings.ReplaceAll(raw, "：", ":")
	if ratioListContains(candidates, normalizedColon) {
		return normalizedColon
	}
	if w, h, ok := parseColonPair(normalizedColon); ok {
		return closestRatioInList(w/h, candidates)
	}
	if w, h, ok := parsePixelFloatPair(cleanPixel); ok {
		return closestRatioInList(w/h, candidates)
	}
	return "3:4"
}

func resolveGeminiImageSize(model, size, quality, imageQuality string) string {
	if !geminiSendsImageSize(model) {
		return ""
	}
	if geminiLiteImageModel(model) {
		return "1K"
	}
	id := strings.ToLower(strings.TrimSpace(model))
	switch {
	case strings.HasSuffix(id, "-4k") || strings.HasSuffix(id, "-hd"):
		return "4K"
	case strings.HasSuffix(id, "-2k"):
		return "2K"
	case strings.HasSuffix(id, "-1k"):
		return "1K"
	}
	for _, token := range []string{imageQuality, quality, size} {
		switch strings.ToLower(strings.TrimSpace(token)) {
		case "512px", "512", "0.5k":
			if geminiSupports512px(model) {
				return "512px"
			}
			return "1K"
		case "low", "1k", "1024":
			return "1K"
		case "medium", "2k", "2048":
			return "2K"
		case "high", "hd", "4k", "4096", "xhigh", "max":
			return "4K"
		}
	}
	cleanPixel := strings.NewReplacer(" ", "", "×", "x", "*", "x").Replace(strings.ToLower(strings.TrimSpace(size)))
	if w, h, ok := parsePixelFloatPair(cleanPixel); ok {
		edge := max(int(w), int(h))
		switch {
		case edge <= 688 && geminiSupports512px(model):
			return "512px"
		case edge <= 1584:
			return "1K"
		case edge <= 3168:
			return "2K"
		default:
			return "4K"
		}
	}
	return "2K"
}

func geminiOfficialPixelSize(model, ratio, imageSize string) string {
	if ratio == "" {
		ratio = "1:1"
	}
	if geminiLegacy25ImageModel(model) {
		if px, ok := gemini25OfficialSizes[ratio]; ok {
			return px
		}
		return gemini25OfficialSizes["1:1"]
	}
	row, ok := gemini3OfficialSizes[ratio]
	if !ok {
		row = gemini3OfficialSizes["1:1"]
	}
	switch imageSize {
	case "512px":
		return row[0]
	case "1K":
		return row[1]
	case "4K":
		return row[3]
	default:
		return row[2]
	}
}

func geminiRatioFromOfficialPixel(pixel string) string {
	for ratio, sizes := range gemini3OfficialSizes {
		for _, item := range sizes {
			if item == pixel {
				return ratio
			}
		}
	}
	for ratio, item := range gemini25OfficialSizes {
		if item == pixel {
			return ratio
		}
	}
	return ""
}

func ratioListContains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func closestRatioInList(target float64, candidates []string) string {
	best := "1:1"
	if len(candidates) > 0 {
		best = candidates[0]
	}
	bestGap := math.MaxFloat64
	for _, ratio := range candidates {
		w, h, ok := parseColonPair(ratio)
		if !ok {
			continue
		}
		gap := math.Abs(math.Log(target / (w / h)))
		if gap < bestGap {
			bestGap = gap
			best = ratio
		}
	}
	return best
}

func parseColonPair(raw string) (float64, float64, bool) {
	parts := strings.Split(strings.TrimSpace(raw), ":")
	if len(parts) != 2 {
		return 0, 0, false
	}
	left, errL := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	right, errR := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if errL != nil || errR != nil || left <= 0 || right <= 0 {
		return 0, 0, false
	}
	return left, right, true
}

func parsePixelFloatPair(raw string) (float64, float64, bool) {
	parts := strings.Split(strings.TrimSpace(raw), "x")
	if len(parts) != 2 {
		return 0, 0, false
	}
	left, errL := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	right, errR := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if errL != nil || errR != nil || left <= 0 || right <= 0 {
		return 0, 0, false
	}
	return left, right, true
}

func grokAspectRatio(size, aspectRatio string) string {
	raw := strings.TrimSpace(aspectRatio)
	if raw == "" {
		raw = strings.TrimSpace(size)
	}
	lower := strings.ToLower(raw)
	if lower == "" || lower == "auto" || lower == "default" || lower == "smart" {
		return "1:1"
	}
	ratio := aspectRatioFromSize(raw)
	switch ratio {
	case "1:1", "2:3", "3:2", "9:16", "16:9":
		return ratio
	case "3:4", "4:5":
		return "2:3"
	case "4:3", "5:4":
		return "3:2"
	case "1:4", "1:8":
		return "9:16"
	case "4:1", "8:1", "21:9":
		return "16:9"
	default:
		return "1:1"
	}
}

func resolveGeminiImageThinkingLevel(model, strength string) string {
	id := strings.ToLower(strings.TrimSpace(model))
	s := strings.ToLower(strings.TrimSpace(strength))
	if s == "" {
		return ""
	}
	supportsMedium := strings.Contains(id, "2.1")
	supportsThinking := supportsMedium || strings.Contains(id, "3.1-flash") || id == "nano-banana-2" || strings.HasPrefix(id, "nano-banana-2-")
	if !supportsThinking {
		return ""
	}
	switch s {
	case "low", "minimal":
		return "minimal"
	case "medium":
		if supportsMedium {
			return "medium"
		}
		return "high"
	case "high", "xhigh", "max":
		return "high"
	default:
		return ""
	}
}
