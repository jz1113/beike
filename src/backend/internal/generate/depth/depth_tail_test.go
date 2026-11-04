package depth

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestDepthTailReplacesShortAbruptBlackEndCardAndPreservesFrameCount(t *testing.T) {
	dir := t.TempDir()
	for index := range 100 {
		value := uint8(140)
		if index >= 96 {
			value = 0
		}
		writeDepthTailFrame(t, dir, index, value, index >= 96)
	}
	count, err := holdDepthTerminalBlackFrames(dir, 30)
	if err != nil || count != 4 || countPNG(dir) != 100 {
		t.Fatalf("held=%d count=%d err=%v", count, countPNG(dir), err)
	}
	before, _ := os.ReadFile(filepath.Join(dir, "000096.png"))
	for index := 96; index < 100; index++ {
		after, _ := os.ReadFile(filepath.Join(dir, fmt.Sprintf("%06d.png", index+1)))
		if !bytes.Equal(before, after) {
			t.Fatalf("frame %d did not retain the final visible pose", index)
		}
	}
}

func TestDepthTailDoesNotRewriteDarkVideosGradualFadesLongCardsOrInteriorCuts(t *testing.T) {
	for _, variant := range []string{"dark", "fade", "long", "interior"} {
		t.Run(variant, func(t *testing.T) {
			dir := t.TempDir()
			for index := range 100 {
				value := uint8(140)
				switch variant {
				case "dark":
					value = 7
				case "fade":
					if index >= 90 {
						value = uint8((99 - index) * 4)
					}
				case "long":
					if index >= 80 {
						value = 0
					}
				case "interior":
					if index >= 80 && index < 90 {
						value = 0
					}
				}
				writeDepthTailFrame(t, dir, index, value, false)
			}
			before, _ := os.ReadFile(filepath.Join(dir, "000100.png"))
			count, err := holdDepthTerminalBlackFrames(dir, 30)
			after, _ := os.ReadFile(filepath.Join(dir, "000100.png"))
			if err != nil || count != 0 || !bytes.Equal(before, after) {
				t.Fatalf("unexpected rewrite: held=%d err=%v", count, err)
			}
		})
	}
}

func writeDepthTailFrame(t *testing.T, dir string, index int, value uint8, text bool) {
	t.Helper()
	frame := image.NewGray(image.Rect(0, 0, 64, 64))
	for y := range 64 {
		for x := range 64 {
			frame.SetGray(x, y, color.Gray{Y: value})
		}
	}
	if text {
		for x := 3; x < 20; x++ {
			frame.SetGray(x, 8, color.Gray{Y: 200})
		}
	}
	file, err := os.Create(filepath.Join(dir, fmt.Sprintf("%06d.png", index+1)))
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, frame); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}
