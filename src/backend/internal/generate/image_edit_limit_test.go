package generate

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEditReferenceLargerThanEightMegabytesIsCompressed(t *testing.T) {
	pngBytes := smoothPNG(t, 2200, 1800)
	if len(pngBytes) <= editImageMaxBytes || len(pngBytes) > editImageSourceLimit {
		t.Fatalf("fixture is %d bytes", len(pngBytes))
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(pngBytes)
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	body, contentType, err := buildImageEditBody(t.Context(), map[string]any{
		"model": "gpt-image-2", "prompt": "背面全身", "size": "1024x1536", "quality": "high",
		"image": []string{"data:image/png;base64," + tinyPNG, "data:image/png;base64," + tinyPNG, server.URL + "/front.png"},
	}, "", false)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := io.ReadAll(body)
	if err != nil {
		t.Fatal(err)
	}
	form, err := multipart.NewReader(bytes.NewReader(raw), boundaryOf(contentType)).ReadForm(32 << 20)
	if err != nil {
		t.Fatal(err)
	}
	files := form.File["image[]"]
	if len(files) != 3 {
		t.Fatalf("files %d", len(files))
	}
	if files[2].Header.Get("Content-Type") != "image/jpeg" {
		t.Fatalf("third reference %s", files[2].Header.Get("Content-Type"))
	}
	opened, err := files[2].Open()
	if err != nil {
		t.Fatal(err)
	}
	defer opened.Close()
	fitted, err := io.ReadAll(opened)
	if err != nil {
		t.Fatal(err)
	}
	if len(fitted) > editImageMaxBytes {
		t.Fatalf("transmission copy is %d bytes", len(fitted))
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(fitted))
	if err != nil || config.Width != 2200 || config.Height != 1800 {
		t.Fatalf("frame %+v %v", config, err)
	}
	if _, err := jpeg.Decode(bytes.NewReader(fitted)); err != nil {
		t.Fatal(err)
	}
}

func smoothPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x), G: uint8(y), B: 40, A: 255})
		}
	}
	var out bytes.Buffer
	if err := (&png.Encoder{CompressionLevel: png.NoCompression}).Encode(&out, img); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}
