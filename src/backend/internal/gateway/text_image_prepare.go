package gateway

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	textImageEdge       = 2048
	textImageByteLimit  = 4 << 20 // Binary bytes; base64 expansion is additional.
	textImagePixelLimit = 40_000_000
	textImageSourceEdge = 32768
)

// DecodeConfig must run before Decode: a tiny compressed source must not cause
// an unbounded pixel allocation. Work only on a derivative; never write back.
func prepareTextImage(ctx context.Context, data []byte, mediaType string) ([]byte, string, error) {
	source, config, err := decodeCheckedImage(ctx, data, mediaType)
	if err != nil {
		return nil, "", err
	}
	// Preserve already suitable JPEG/PNG bytes, including transparency and EXIF.
	// GIF/WebP are flattened to a static frame for consistent provider support.
	if config.Width <= textImageEdge && config.Height <= textImageEdge && len(data) <= textImageByteLimit && (mediaType == "image/jpeg" || mediaType == "image/png") {
		return data, mediaType, nil
	}
	if mediaType == "image/jpeg" {
		source = orientTextImage(source, data)
	}
	body, err := encodeTextImage(ctx, source, textImageByteLimit)
	if err != nil {
		return nil, "", err
	}
	return body, "image/jpeg", nil
}

// CompressUploadImage builds a JPEG transmission copy that fits budget.
// Dimensions stay when the original size already fits; the stored source is not modified.
func CompressUploadImage(ctx context.Context, data []byte, mediaType string, budget int) ([]byte, string, error) {
	if budget < 1 {
		return nil, "", &TextImageError{Kind: "size"}
	}
	source, config, err := decodeCheckedImage(ctx, data, mediaType)
	if err != nil {
		return nil, "", err
	}
	if mediaType == "image/jpeg" {
		source = orientTextImage(source, data)
	}
	body, err := encodeFittedImage(ctx, source, max(config.Width, config.Height), budget)
	if err != nil {
		return nil, "", err
	}
	return body, "image/jpeg", nil
}

func decodeCheckedImage(ctx context.Context, data []byte, mediaType string) (image.Image, image.Config, error) {
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, image.Config{}, &TextImageError{Kind: "invalid", err: err}
	}
	if config.Width < 1 || config.Height < 1 || config.Width > textImageSourceEdge || config.Height > textImageSourceEdge || config.Width > textImagePixelLimit/config.Height {
		return nil, image.Config{}, &TextImageError{Kind: "size"}
	}
	if err := ctx.Err(); err != nil {
		return nil, image.Config{}, &TextImageError{Kind: "invalid", err: err}
	}
	// Decode, rather than trusting magic bytes or a valid header, also rejects
	// truncated/corrupt images. GIF Decode reads only the first frame.
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, image.Config{}, &TextImageError{Kind: "invalid", err: err}
	}
	if mediaType == "image/gif" && source.Bounds().In(image.Rect(0, 0, config.Width, config.Height)) {
		source = textImageCanvas{Image: source, bounds: image.Rect(0, 0, config.Width, config.Height)}
	}
	if source.Bounds().Dx() != config.Width || source.Bounds().Dy() != config.Height {
		return nil, image.Config{}, &TextImageError{Kind: "invalid"}
	}
	if err := ctx.Err(); err != nil {
		return nil, image.Config{}, &TextImageError{Kind: "invalid", err: err}
	}
	return source, config, nil
}

type textImageCanvas struct {
	image.Image
	bounds image.Rectangle
}

func (im textImageCanvas) Bounds() image.Rectangle { return im.bounds }

func (im textImageCanvas) At(x, y int) color.Color {
	if !(image.Pt(x, y).In(im.Image.Bounds())) {
		return color.Transparent
	}
	return im.Image.At(x, y)
}

// Reuse the existing attachment pipeline's CatmullRom scaling, white matte and
// JPEG encoding approach, without depending on the assistant domain package.
func fitTextImage(source image.Image, edge int) *image.RGBA {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width > edge || height > edge {
		if width >= height {
			height, width = max(1, height*edge/width), edge
		} else {
			width, height = max(1, width*edge/height), edge
		}
	}
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(target, target.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	if width == bounds.Dx() && height == bounds.Dy() {
		draw.Draw(target, target.Bounds(), source, bounds.Min, draw.Over)
	} else {
		xdraw.CatmullRom.Scale(target, target.Bounds(), source, bounds, draw.Over, nil)
	}
	return target
}

func encodeTextImage(ctx context.Context, source image.Image, budget int) ([]byte, error) {
	return encodeFittedImage(ctx, source, textImageEdge, budget)
}

func encodeFittedImage(ctx context.Context, source image.Image, edge, budget int) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, &TextImageError{Kind: "invalid", err: err}
	}
	if edge < 1 {
		return nil, &TextImageError{Kind: "size"}
	}
	fitted := fitTextImage(source, edge)
	for {
		for _, quality := range []int{90, 80, 65} {
			if err := ctx.Err(); err != nil {
				return nil, &TextImageError{Kind: "invalid", err: err}
			}
			var encoded bytes.Buffer
			if err := jpeg.Encode(&encoded, fitted, &jpeg.Options{Quality: quality}); err != nil {
				return nil, &TextImageError{Kind: "invalid", err: err}
			}
			if encoded.Len() <= budget {
				return encoded.Bytes(), nil
			}
		}
		bounds := fitted.Bounds()
		edge := max(bounds.Dx(), bounds.Dy())
		if edge <= 1 {
			return nil, &TextImageError{Kind: "size"}
		}
		fitted = fitTextImage(source, max(1, edge*3/4))
	}
}
