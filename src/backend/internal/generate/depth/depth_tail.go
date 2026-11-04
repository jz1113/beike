package depth

import (
	"image"
	_ "image/png"
	"math"
	"os"
	"path/filepath"
	"sort"
)

// holdDepthTerminalBlackFrames keeps an abrupt, short, static end card from
// becoming invented scene geometry during depth inference. Only extracted
// temporary frames are changed; the original video and duration are preserved.
func holdDepthTerminalBlackFrames(dir string, fps float64) (int, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.png"))
	if err != nil {
		return 0, err
	}
	sort.Strings(files)
	maxTail := min(int(math.Ceil(fps)), len(files)/10)
	if maxTail < 2 {
		return 0, nil
	}
	last, err := depthFrameLuma(files[len(files)-1])
	if err != nil || !isDepthBlackCard(last) {
		return 0, err
	}
	start := len(files) - 1
	for start > 0 && len(files)-start <= maxTail {
		previous, readErr := depthFrameLuma(files[start-1])
		if readErr != nil {
			return 0, readErr
		}
		if !isDepthBlackCard(previous) || depthLumaDifference(previous, last) > 1.5 {
			break
		}
		start--
	}
	count := len(files) - start
	if count < 2 || count > maxTail || start == 0 {
		return 0, nil
	}
	before, err := depthFrameLuma(files[start-1])
	if err != nil {
		return 0, err
	}
	// An abrupt transition from a visible scene is required. Dark footage and
	// gradual fades are left intact instead of being mistaken for an end card.
	if depthLumaMean(before) < 40 || depthLumaDifference(before, last) < 40 {
		return 0, nil
	}
	frame, err := os.ReadFile(files[start-1])
	if err != nil {
		return 0, err
	}
	for _, path := range files[start:] {
		if err := os.WriteFile(path, frame, 0o600); err != nil {
			return 0, err
		}
	}
	return count, nil
}

func depthFrameLuma(path string) ([]float64, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	frame, _, err := image.Decode(file)
	if err != nil {
		return nil, err
	}
	bounds := frame.Bounds()
	const samples = 64
	values := make([]float64, 0, samples*samples)
	for y := range samples {
		for x := range samples {
			r, g, b, _ := frame.At(bounds.Min.X+x*bounds.Dx()/samples, bounds.Min.Y+y*bounds.Dy()/samples).RGBA()
			values = append(values, (0.299*float64(r)+0.587*float64(g)+0.114*float64(b))/257)
		}
	}
	return values, nil
}

func isDepthBlackCard(values []float64) bool {
	if len(values) == 0 || depthLumaMean(values) > 8 {
		return false
	}
	dark := 0
	for _, value := range values {
		if value < 24 {
			dark++
		}
	}
	return float64(dark)/float64(len(values)) >= 0.985
}

func depthLumaMean(values []float64) float64 {
	var total float64
	for _, value := range values {
		total += value
	}
	return total / float64(max(1, len(values)))
}

func depthLumaDifference(a, b []float64) float64 {
	var total float64
	for index, value := range a {
		total += math.Abs(value - b[index])
	}
	return total / float64(max(1, len(a)))
}
