package assistant

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/bmp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

const attachmentImageEdge = 2048
const attachmentPixelLimit = 40_000_000

func prepareAttachmentImage(body []byte) ([]byte, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > attachmentPixelLimit {
		return nil, errImage
	}
	source, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	flat := flattenWhite(orientImage(source, attachmentOrientation(body)))
	fitted := fitAttachment(flat)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, fitted, &jpeg.Options{Quality: 90}); err != nil {
		return nil, err
	}
	return encoded.Bytes(), nil
}

func flattenWhite(source image.Image) *image.RGBA {
	bounds := source.Bounds()
	flat := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(flat, flat.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(flat, flat.Bounds(), source, bounds.Min, draw.Over)
	return flat
}

func fitAttachment(source image.Image) image.Image {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= attachmentImageEdge && height <= attachmentImageEdge {
		return source
	}
	targetWidth, targetHeight := width, height
	if width >= height {
		targetWidth = attachmentImageEdge
		targetHeight = attachmentImageEdge * height / width
	} else {
		targetHeight = attachmentImageEdge
		targetWidth = attachmentImageEdge * width / height
	}
	if targetWidth < 1 {
		targetWidth = 1
	}
	if targetHeight < 1 {
		targetHeight = 1
	}
	fitted := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	xdraw.CatmullRom.Scale(fitted, fitted.Bounds(), source, bounds, draw.Over, nil)
	return fitted
}

type imageError string

func (err imageError) Error() string { return string(err) }

const errImage imageError = "image"
