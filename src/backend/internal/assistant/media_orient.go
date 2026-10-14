package assistant

import (
	"bytes"
	"image"
	"image/color"

	"github.com/rwcarlsen/goexif/exif"
)

func attachmentOrientation(body []byte) int {
	decoded, err := exif.Decode(bytes.NewReader(body))
	if err != nil {
		return 1
	}
	tag, err := decoded.Get(exif.Orientation)
	if err != nil {
		return 1
	}
	value, err := tag.Int(0)
	if err != nil || value < 1 || value > 8 {
		return 1
	}
	return value
}

func orientImage(source image.Image, orientation int) image.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	switch orientation {
	case 2:
		return remapImage(source, width, height, func(x, y int) (int, int) { return width - 1 - x, y })
	case 3:
		return remapImage(source, width, height, func(x, y int) (int, int) { return width - 1 - x, height - 1 - y })
	case 4:
		return remapImage(source, width, height, func(x, y int) (int, int) { return x, height - 1 - y })
	case 5:
		return remapImage(source, height, width, func(x, y int) (int, int) { return y, x })
	case 6:
		return remapImage(source, height, width, func(x, y int) (int, int) { return y, height - 1 - x })
	case 7:
		return remapImage(source, height, width, func(x, y int) (int, int) { return width - 1 - y, height - 1 - x })
	case 8:
		return remapImage(source, height, width, func(x, y int) (int, int) { return width - 1 - y, x })
	default:
		return source
	}
}

func remapImage(source image.Image, width, height int, pick func(x, y int) (int, int)) *image.RGBA {
	bounds := source.Bounds()
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			sx, sy := pick(x, y)
			target.SetRGBA(x, y, color.RGBAModel.Convert(source.At(bounds.Min.X+sx, bounds.Min.Y+sy)).(color.RGBA))
		}
	}
	return target
}
