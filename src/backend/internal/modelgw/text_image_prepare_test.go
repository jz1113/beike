package modelgw

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestCompressUploadImageKeepsDimensionsWhenJPEGFits(t *testing.T) {
	original := textPNGFixture(1600, 1000, png.NoCompression)
	if len(original) <= textImageByteLimit {
		t.Fatal("fixture does not exceed the vision byte budget")
	}
	body, mediaType, err := CompressUploadImage(context.Background(), original, "image/png", 8<<20)
	if err != nil || mediaType != "image/jpeg" || len(body) > 8<<20 || len(body) >= len(original) {
		t.Fatalf("type=%s bytes=%d err=%v", mediaType, len(body), err)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil || config.Width != 1600 || config.Height != 1000 {
		t.Fatalf("upload copy changed the frame: %+v %v", config, err)
	}
}

func TestTextImageOversizedBytesWithinDimensionsAreCompressed(t *testing.T) {
	original := textPNGFixture(1600, 1000, png.NoCompression)
	if len(original) <= textImageByteLimit {
		t.Fatal("fixture does not exceed model byte budget")
	}
	body, mediaType, err := prepareTextImage(context.Background(), original, "image/png")
	if err != nil || mediaType != "image/jpeg" || len(body) > textImageByteLimit {
		t.Fatalf("type=%s bytes=%d err=%v", mediaType, len(body), err)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil || config.Width != 1600 || config.Height != 1000 {
		t.Fatalf("unnecessary scaling: %+v %v", config, err)
	}
}

func TestTextImageJPEGOrientationSurvivesResize(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 2100, 1050))
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, nil); err != nil {
		t.Fatal(err)
	}
	// JPEG APP1 with one little-endian TIFF orientation entry, value 6 (90 CW).
	tiff := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0}
	app1 := append([]byte{'E', 'x', 'i', 'f', 0, 0}, tiff...)
	segment := []byte{0xff, 0xe1, 0, 0}
	binary.BigEndian.PutUint16(segment[2:], uint16(len(app1)+2))
	body := append(bytes.Clone(encoded.Bytes()[:2]), segment...)
	body = append(body, app1...)
	body = append(body, encoded.Bytes()[2:]...)
	mediaType, data, err := textImage(context.Background(), textImageDataURL("image/jpeg", body))
	if err != nil || mediaType != "image/jpeg" {
		t.Fatal(mediaType, err)
	}
	prepared, _ := base64.StdEncoding.DecodeString(data)
	config, _, err := image.DecodeConfig(bytes.NewReader(prepared))
	if err != nil || config.Width != 1024 || config.Height != 2048 {
		t.Fatalf("EXIF orientation lost: %+v %v", config, err)
	}
}

func TestTextImageOrientationViewsAndThinImages(t *testing.T) {
	source := image.NewGray(image.Rect(3, 4, 6, 6))
	for y := 0; y < 2; y++ {
		for x := 0; x < 3; x++ {
			source.SetGray(3+x, 4+y, color.Gray{Y: uint8(1 + y*3 + x)})
		}
	}
	for _, tc := range []struct {
		orientation int
		pixels      []uint8
	}{
		{2, []uint8{3, 2, 1, 6, 5, 4}},
		{3, []uint8{6, 5, 4, 3, 2, 1}},
		{4, []uint8{4, 5, 6, 1, 2, 3}},
		{5, []uint8{1, 4, 2, 5, 3, 6}},
		{6, []uint8{4, 1, 5, 2, 6, 3}},
		{7, []uint8{6, 3, 5, 2, 4, 1}},
		{8, []uint8{3, 6, 2, 5, 1, 4}},
	} {
		view := textOrientedImage{Image: source, orientation: tc.orientation}
		bounds := view.Bounds()
		for i, want := range tc.pixels {
			got := color.GrayModel.Convert(view.At(i%bounds.Dx(), i/bounds.Dx())).(color.Gray).Y
			if got != want {
				t.Fatalf("orientation %d pixel %d = %d want %d", tc.orientation, i, got, want)
			}
		}
	}
	for _, bounds := range []image.Rectangle{image.Rect(0, 0, 1, 5000), image.Rect(0, 0, 5000, 1)} {
		fitted := fitTextImage(image.NewRGBA(bounds), textImageEdge).Bounds()
		if min(fitted.Dx(), fitted.Dy()) != 1 || max(fitted.Dx(), fitted.Dy()) != textImageEdge {
			t.Fatalf("thin image collapsed: %v", fitted)
		}
	}
}
