package gateway

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func textImageDataURL(mediaType string, body []byte) string {
	return "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(body)
}

func textPNGFixture(width, height int, compression png.CompressionLevel) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	state := uint32(7)
	for i := 0; i < len(img.Pix); i += 4 {
		for c := 0; c < 3; c++ {
			state = state*1664525 + 1013904223
			img.Pix[i+c] = byte(state >> 24)
		}
		img.Pix[i+3] = 255
	}
	var out bytes.Buffer
	encoder := png.Encoder{CompressionLevel: compression}
	if err := encoder.Encode(&out, img); err != nil {
		panic(err) // bytes.Buffer cannot fail writes.
	}
	return out.Bytes()
}

func requireTextImageKind(t *testing.T, err error, kind string) {
	t.Helper()
	var imageErr *TextImageError
	if !errors.As(err, &imageErr) || imageErr.Kind != kind {
		t.Fatalf("want image error %s, got %v", kind, err)
	}
}

func TestTextImageLargeOriginalIsPreparedForDataAndURL(t *testing.T) {
	original := textPNGFixture(2400, 1600, png.NoCompression)
	if len(original) <= 10<<20 || len(original) >= textImageSourceLimit {
		t.Fatalf("fixture does not cover old limit: %d", len(original))
	}
	before := bytes.Clone(original)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("x-api-key") != "" {
			t.Error("model credentials leaked to image download")
		}
		w.Header().Set("Content-Type", "image/png; charset=binary")
		w.Write(original)
	}))
	defer server.Close()
	previous := textImageClient
	textImageClient = func() *http.Client { return server.Client() }
	t.Cleanup(func() { textImageClient = previous })
	for _, source := range []string{textImageDataURL("image/png", original), server.URL + "/original?token=private"} {
		mediaType, encoded, err := textImage(context.Background(), source)
		if err != nil {
			t.Fatal(err)
		}
		body, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(body) > textImageByteLimit || mediaType != "image/jpeg" {
			t.Fatalf("type=%s bytes=%d err=%v", mediaType, len(body), err)
		}
		img, _, err := image.Decode(bytes.NewReader(body))
		if err != nil || img.Bounds().Dx() != 2048 || img.Bounds().Dy() != 1365 {
			t.Fatalf("unexpected scaled output: image=%v err=%v", img, err)
		}
	}
	if !bytes.Equal(before, original) {
		t.Fatal("original material was mutated")
	}
}

func TestTextImageSmallPNGIsLosslessAndValid(t *testing.T) {
	body := textPNGFixture(23, 11, png.DefaultCompression)
	mediaType, encoded, err := textImage(context.Background(), textImageDataURL("image/png", body))
	decoded, _ := base64.StdEncoding.DecodeString(encoded)
	if err != nil || mediaType != "image/png" || !bytes.Equal(decoded, body) {
		t.Fatalf("small PNG changed: type=%s err=%v", mediaType, err)
	}
}

func TestTextImageRejectsBombsAndCorruptPayloads(t *testing.T) {
	valid := textPNGFixture(2, 2, png.DefaultCompression)
	for _, dimensions := range [][2]uint32{{10000, 10000}, {1, textImageSourceEdge + 1}} {
		// A complete, CRC-valid IHDR is enough for DecodeConfig but not Decode.
		// Receiving a size error proves the full decoder was never invoked.
		bomb := bytes.Clone(valid[:33])
		binary.BigEndian.PutUint32(bomb[16:20], dimensions[0])
		binary.BigEndian.PutUint32(bomb[20:24], dimensions[1])
		binary.BigEndian.PutUint32(bomb[29:33], crc32.ChecksumIEEE(bomb[12:29]))
		_, _, err := textImage(context.Background(), textImageDataURL("image/png", bomb))
		requireTextImageKind(t, err, "size")
	}
	_, _, err := textImage(context.Background(), textImageDataURL("image/png", valid[:33]))
	requireTextImageKind(t, err, "invalid")
	corrupt := bytes.Clone(valid)
	corrupt[45] ^= 0xff
	_, _, err = textImage(context.Background(), textImageDataURL("image/png", corrupt))
	requireTextImageKind(t, err, "invalid")
	mediaType, encoded, err := textImage(context.Background(), textImageDataURL("image/jpeg", valid))
	decoded, _ := base64.StdEncoding.DecodeString(encoded)
	if err != nil || mediaType != "image/png" || !bytes.Equal(decoded, valid) {
		t.Fatalf("mislabeled PNG rejected: type=%s err=%v", mediaType, err)
	}
	_, _, err = textImage(context.Background(), textImageDataURL("image/png", []byte("<html>not-an-image</html>")))
	requireTextImageKind(t, err, "mismatch")
}

func TestTextImageSourceByteCapsAndCancelledContext(t *testing.T) {
	_, _, err := textImage(context.Background(), "data:image/png;base64,"+strings.Repeat("A", base64.StdEncoding.EncodedLen(textImageSourceLimit)+1))
	requireTextImageKind(t, err, "size")
	previous := textImageClient
	t.Cleanup(func() { textImageClient = previous })
	for _, declared := range []int64{textImageSourceLimit + 1, -1} {
		body := &textImageCountingBody{remaining: textImageSourceLimit + 100}
		textImageClient = func() *http.Client {
			return &http.Client{Transport: textImageTestTransport(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"image/png"}}, Body: body, ContentLength: declared}, nil
			})}
		}
		_, _, err := textImage(context.Background(), "https://example.test/image?private=secret")
		requireTextImageKind(t, err, "size")
		if !body.closed || body.read > textImageSourceLimit+1 || declared > 0 && body.read != 0 {
			t.Fatalf("unsafe read: declared=%d read=%d closed=%v", declared, body.read, body.closed)
		}
		if strings.Contains(err.Error(), "secret") {
			t.Fatal("source URL leaked")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, _, err = textImage(ctx, textTestPNG)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
}

func TestTextImageEncoderBudgetsAndWhiteMatte(t *testing.T) {
	body := textPNGFixture(192, 96, png.NoCompression)
	source, _, _ := image.Decode(bytes.NewReader(body))
	encoded, err := encodeTextImage(context.Background(), source, 900)
	if err != nil || len(encoded) > 900 {
		t.Fatalf("budget exceeded: bytes=%d err=%v", len(encoded), err)
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(encoded))
	if err != nil || config.Width >= 192 || config.Width < 1 || config.Height < 1 || abs(config.Width-2*config.Height) > 1 {
		t.Fatalf("bad proportional reduction: %+v err=%v", config, err)
	}
	_, err = encodeTextImage(context.Background(), source, 1)
	requireTextImageKind(t, err, "size")
	transparent := image.NewNRGBA(image.Rect(0, 0, 4, 2))
	encoded, err = encodeTextImage(context.Background(), transparent, textImageByteLimit)
	if err != nil {
		t.Fatal(err)
	}
	flat, _, err := image.Decode(bytes.NewReader(encoded))
	if err != nil || color.NRGBAModel.Convert(flat.At(0, 0)).(color.NRGBA).R < 250 {
		t.Fatal("transparent source did not receive white matte", err)
	}
}

func TestTextImageGIFUsesOneStaticFrame(t *testing.T) {
	frame := image.NewPaletted(image.Rect(2, 1, 6, 3), color.Palette{color.White, color.Black})
	var body bytes.Buffer
	if err := gif.EncodeAll(&body, &gif.GIF{Image: []*image.Paletted{frame, frame}, Delay: []int{0, 0}, Config: image.Config{ColorModel: frame.Palette, Width: 8, Height: 4}}); err != nil {
		t.Fatal(err)
	}
	mediaType, encoded, err := textImage(context.Background(), textImageDataURL("image/gif", body.Bytes()))
	if err != nil || mediaType != "image/jpeg" {
		t.Fatalf("animated image not prepared: %s %v", mediaType, err)
	}
	decoded, _ := base64.StdEncoding.DecodeString(encoded)
	config, _, err := image.DecodeConfig(bytes.NewReader(decoded))
	if err != nil || config.Width != 8 || config.Height != 4 {
		t.Fatalf("bad static frame: %+v %v", config, err)
	}
}

func TestTextImageAcceptsMislabeledJPEGAndRetailHeaders(t *testing.T) {
	var body bytes.Buffer
	if err := jpeg.Encode(&body, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	mediaType, encoded, err := textImage(context.Background(), textImageDataURL("image/png", body.Bytes()))
	decoded, _ := base64.StdEncoding.DecodeString(encoded)
	if err != nil || mediaType != "image/jpeg" || !bytes.Equal(decoded, body.Bytes()) {
		t.Fatalf("png-labeled JPEG: type=%s err=%v", mediaType, err)
	}
	wrapped := DataImageURL(base64.StdEncoding.EncodeToString(body.Bytes()))
	if !strings.HasPrefix(wrapped, "data:image/jpeg;base64,") {
		t.Fatal(wrapped[:40])
	}
	previous := textImageClient
	textImageClient = func() *http.Client {
		return &http.Client{Transport: textImageTestTransport(func(r *http.Request) (*http.Response, error) {
			if !strings.Contains(r.Header.Get("User-Agent"), "Mozilla") || strings.Contains(r.Header.Get("Accept"), "avif") || r.Header.Get("Authorization") != "" {
				t.Errorf("ua=%s accept=%s", r.Header.Get("User-Agent"), r.Header.Get("Accept"))
			}
			header := "image/jpg"
			if strings.HasSuffix(r.URL.Path, "/raw") {
				header = "application/octet-stream"
				if r.Header.Get("Referer") != "" {
					t.Errorf("unexpected referer %s", r.Header.Get("Referer"))
				}
			} else if r.Header.Get("Referer") != "https://www.taobao.com/" {
				t.Errorf("referer %s", r.Header.Get("Referer"))
			}
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {header}}, Body: io.NopCloser(bytes.NewReader(body.Bytes())), ContentLength: int64(body.Len())}, nil
		})}
	}
	t.Cleanup(func() { textImageClient = previous })
	for _, source := range []string{"https://img.alicdn.com/a.jpg?token=secret", "https://cdn.example/raw"} {
		mediaType, _, err = textImage(context.Background(), source)
		if err != nil || mediaType != "image/jpeg" || strings.Contains(errString(err), "secret") {
			t.Fatalf("%s: type=%s err=%v", source, mediaType, err)
		}
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func TestTextImageWebPIsDecodedAndPrepared(t *testing.T) {
	// A 1x1 VP8 image, embedded to keep the regression independent of disk assets.
	source := "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"
	mediaType, encoded, err := textImage(context.Background(), source)
	if err != nil || mediaType != "image/jpeg" {
		t.Fatalf("WebP preparation: %s %v", mediaType, err)
	}
	body, _ := base64.StdEncoding.DecodeString(encoded)
	config, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil || config.Width != 1 || config.Height != 1 {
		t.Fatalf("bad WebP derivative: %+v %v", config, err)
	}
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

type textImageTestTransport func(*http.Request) (*http.Response, error)

func (f textImageTestTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

type textImageCountingBody struct {
	remaining int
	read      int
	closed    bool
}

func (b *textImageCountingBody) Read(p []byte) (int, error) {
	if b.remaining == 0 {
		return 0, io.EOF
	}
	n := min(len(p), b.remaining)
	clear(p[:n])
	b.remaining -= n
	b.read += n
	return n, nil
}

func (b *textImageCountingBody) Close() error { b.closed = true; return nil }

func TestTextImageRetriesBrokenDownloadOnce(t *testing.T) {
	var body bytes.Buffer
	if err := jpeg.Encode(&body, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	previous := textImageClient
	attempts := 0
	textImageClient = func() *http.Client {
		return &http.Client{Transport: textImageTestTransport(func(r *http.Request) (*http.Response, error) {
			attempts++
			if attempts == 1 {
				return nil, errors.New("connection reset")
			}
			if !r.Close {
				t.Error("retry reused a pooled connection")
			}
			return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/octet-stream"}}, Body: io.NopCloser(bytes.NewReader(body.Bytes()))}, nil
		})}
	}
	t.Cleanup(func() { textImageClient = previous })
	mediaType, _, err := textImage(context.Background(), "https://cdn.example/a.octet-stream")
	if err != nil || mediaType != "image/jpeg" || attempts != 2 {
		t.Fatalf("type=%s attempts=%d err=%v", mediaType, attempts, err)
	}
	attempts = 0
	textImageClient = func() *http.Client {
		return &http.Client{Transport: textImageTestTransport(func(r *http.Request) (*http.Response, error) {
			attempts++
			return &http.Response{StatusCode: 403, Body: io.NopCloser(strings.NewReader("denied")), Header: make(http.Header)}, nil
		})}
	}
	_, _, err = textImage(context.Background(), "https://cdn.example/denied.jpg")
	requireTextImageKind(t, err, "status")
	if attempts != 1 {
		t.Fatalf("HTTP status was retried: %d", attempts)
	}
}
