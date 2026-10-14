package assistant

import (
	"image"
	"image/color"
	"testing"
)

func TestOrientImageRotatesClockwise(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 2, 1))
	source.SetRGBA(0, 0, color.RGBA{R: 255, A: 255})
	source.SetRGBA(1, 0, color.RGBA{B: 255, A: 255})
	rotated := orientImage(source, 6)
	if rotated.Bounds().Dx() != 1 || rotated.Bounds().Dy() != 2 {
		t.Fatalf("size %v", rotated.Bounds())
	}
	top := rotated.At(0, 0)
	bottom := rotated.At(0, 1)
	if top != (color.RGBA{R: 255, A: 255}) || bottom != (color.RGBA{B: 255, A: 255}) {
		t.Fatalf("top %v bottom %v", top, bottom)
	}
}
