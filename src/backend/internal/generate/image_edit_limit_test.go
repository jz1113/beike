package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })

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

func TestImageReferenceDownloadReportsStatusWithoutSignedURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusForbidden) }))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	_, err := downloadEditImage(context.Background(), server.URL+"/person.png?signature=private-signature")
	if err == nil || !strings.Contains(err.Error(), "HTTP 403") {
		t.Fatalf("missing download status: %v", err)
	}
	if strings.Contains(err.Error(), "signature") || strings.Contains(err.Error(), "person.png") {
		t.Fatalf("signed URL leaked: %v", err)
	}
}

func TestEditImageReadsAbsoluteLoopbackStorageWithoutHTTP(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	raw, err := base64.StdEncoding.DecodeString(tinyPNG)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "local", "azhuo", "assets", "person.png")
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	previous := gateway.ModelHTTP
	calls := 0
	gateway.ModelHTTP = func() *http.Client { calls++; return previous() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	for _, origin := range []string{"http://127.0.0.1:5173", "http://localhost:3000", "https://[::1]:5173"} {
		file, err := loadEditImage(context.Background(), origin+"/storage/local/azhuo/assets/person.png?download=1", 1, "local", true)
		if err != nil {
			t.Fatalf("local storage read failed for %s: %v", origin, err)
		}
		if !bytes.Equal(file.data, raw) || file.filename != "image-2.png" {
			t.Fatal("reference bytes or order changed")
		}
	}
	if calls != 0 {
		t.Fatalf("local storage used outbound HTTP %d times", calls)
	}
	if _, err := loadEditImage(context.Background(), "http://127.0.0.1:5173/storage/local/azhuo/assets/person.png", 1, "other", true); err == nil || !strings.Contains(err.Error(), "无权读取") {
		t.Fatalf("workspace isolation lost: %v", err)
	}
}

func TestLocalEditStorageReferenceKeepsRemoteAndRejectsEscapes(t *testing.T) {
	for _, ref := range []string{"https://cdn.example/storage/local/person.png?sig=keep", "http://192.168.1.1/storage/local/person.png", "http://127.0.0.1:5173/api/private", "http://user:secret@localhost/storage/local/person.png"} {
		if got := localEditStorageReference(ref); got != ref {
			t.Fatal("nonlocal or credentialed URL was rewritten")
		}
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	for _, ref := range []string{"http://localhost:5173/storage/local/%2e%2e/%2e%2e/secret.png", "http://localhost:5173/storage/local/%252e%252e/%252e%252e/secret.png"} {
		if _, err := loadEditImage(t.Context(), ref, 1, "local", true); err == nil {
			t.Fatal("escaped workspace path accepted")
		}
	}
}
