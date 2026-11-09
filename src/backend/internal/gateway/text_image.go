package gateway

import (
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Source downloads may be larger than the model input. Keep this aligned with
// the public image proxy's 25 MiB ceiling, not the vision encoding budget.
const textImageSourceLimit = 25 << 20

// Image requests never inherit model credentials, cookies or custom transports.
var textImageClient = func() *http.Client { return network.SafeClient() }

// TextImageError classifies image preparation without exposing the source URL.
type TextImageError struct {
	Kind   string
	Status int
	err    error
}

func (e *TextImageError) Error() string {
	switch e.Kind {
	case "download":
		return "safe remote image download failed"
	case "status":
		return fmt.Sprintf("remote image HTTP %d", e.Status)
	case "mime":
		return "unsupported text image MIME"
	case "mismatch":
		return "text image MIME does not match content"
	case "size":
		return "invalid text image size"
	case "data":
		return "image data URL must use base64"
	default:
		return "invalid text image"
	}
}

func (e *TextImageError) Unwrap() error { return e.err }

// IndexedImageError identifies the catalog picture that failed preparation.
type IndexedImageError struct {
	Index int
	Err   error
}

func (e *IndexedImageError) Error() string {
	return fmt.Sprintf("图片编号 %d：%s", e.Index, e.Err.Error())
}

func (e *IndexedImageError) Unwrap() error { return e.Err }

func failTextImage(part map[string]any, err error) error {
	if err == nil {
		return nil
	}
	image := textMap(part["image_url"])
	if _, ok := image["index"]; !ok {
		return err
	}
	return &IndexedImageError{Index: int(textNumber(image["index"])), Err: err}
}

func textImage(ctx context.Context, raw string) (string, string, error) {
	if err := ctx.Err(); err != nil {
		return "", "", &TextImageError{Kind: "invalid", err: err}
	}
	data, mediaType, err := readTextImage(ctx, raw)
	if err != nil {
		return "", "", err
	}
	if len(data) == 0 || len(data) > textImageSourceLimit {
		return "", "", &TextImageError{Kind: "size"}
	}
	mediaType, err = matchTextImageType(mediaType, data)
	if err != nil {
		return "", "", err
	}
	data, mediaType, err = prepareTextImage(ctx, data, mediaType)
	if err != nil {
		return "", "", err
	}
	return mediaType, base64.StdEncoding.EncodeToString(data), nil
}

func readTextImage(ctx context.Context, raw string) ([]byte, string, error) {
	if strings.HasPrefix(raw, "data:") {
		head, body, ok := strings.Cut(strings.TrimPrefix(raw, "data:"), ",")
		if !ok || !strings.HasSuffix(head, ";base64") {
			return nil, "", &TextImageError{Kind: "data"}
		}
		mediaType, _, err := mime.ParseMediaType(strings.TrimSuffix(head, ";base64"))
		if err != nil {
			return nil, "", &TextImageError{Kind: "mime", err: err}
		}
		if len(body) > base64.StdEncoding.EncodedLen(textImageSourceLimit) {
			return nil, "", &TextImageError{Kind: "size"}
		}
		data, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			return nil, "", &TextImageError{Kind: "invalid", err: err}
		}
		return data, mediaType, nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return nil, "", &TextImageError{Kind: "invalid", err: err}
	}
	downloadCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	data, mediaType, err := fetchRemoteTextImage(downloadCtx, u, false)
	if remoteDownloadRetriable(downloadCtx, err) {
		data, mediaType, err = fetchRemoteTextImage(downloadCtx, u, true)
	}
	return data, mediaType, err
}

func remoteDownloadRetriable(ctx context.Context, err error) bool {
	var image *TextImageError
	return ctx.Err() == nil && errors.As(err, &image) && image.Kind == "download"
}

func fetchRemoteTextImage(ctx context.Context, u *url.URL, fresh bool) ([]byte, string, error) {
	attemptCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(attemptCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", &TextImageError{Kind: "invalid", err: err}
	}
	for key, value := range media.RemoteImageHeaders(u.String()) {
		req.Header.Set(key, value)
	}
	if fresh {
		req.Close = true
	}
	response, err := textImageClient().Do(req)
	if err != nil {
		return nil, "", &TextImageError{Kind: "download", err: err}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", &TextImageError{Kind: "status", Status: response.StatusCode}
	}
	if response.ContentLength > textImageSourceLimit {
		return nil, "", &TextImageError{Kind: "size"}
	}
	mediaType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	data, err := io.ReadAll(io.LimitReader(response.Body, textImageSourceLimit+1))
	if err != nil {
		return nil, "", &TextImageError{Kind: "download", err: err}
	}
	return data, mediaType, nil
}

// Public URLs retain provider fetching; protected CDN inputs are embedded with
// source-specific headers. Native protocols embed all images.
func prepareOpenAITextImages(ctx context.Context, payload map[string]any) error {
	for _, raw := range textArray(payload["messages"]) {
		for _, rawPart := range textArray(textMap(raw)["content"]) {
			part := textMap(rawPart)
			if textString(part["type"]) != "image_url" {
				continue
			}
			image := textMap(part["image_url"])
			source := textString(image["url"])
			if !strings.HasPrefix(source, "data:") && !remoteImageNeedsInline(source) {
				continue
			}
			mediaType, data, err := textImage(ctx, source)
			if err != nil {
				return failTextImage(part, err)
			}
			image["url"] = "data:" + mediaType + ";base64," + data
		}
	}
	return nil
}

// A declared label is only a hint. GPT Image and retail CDNs often store JPEG
// bytes behind image/png, image/jpg, or application/octet-stream. Non-image
// bytes that claim to be a picture stay a mismatch.
func matchTextImageType(declared string, data []byte) (string, error) {
	sniffed := sniffedImageType(data)
	if sniffed == "" {
		if supportedImageType(canonicalImageType(declared)) {
			return "", &TextImageError{Kind: "mismatch"}
		}
		return "", &TextImageError{Kind: "mime"}
	}
	return sniffed, nil
}

func canonicalImageType(mediaType string) string {
	switch strings.ToLower(strings.TrimSpace(mediaType)) {
	case "image/jpg", "image/pjpeg", "image/x-citrix-jpeg":
		return "image/jpeg"
	case "image/x-png", "image/x-citrix-png":
		return "image/png"
	default:
		return strings.ToLower(strings.TrimSpace(mediaType))
	}
}

func supportedImageType(mediaType string) bool {
	switch mediaType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return true
	default:
		return false
	}
}

// OSS objects saved as *.octet-stream are real pictures with a generic type.
// Other remote URLs stay provider-fetched so signed product images are not inlined.
func remoteImageNeedsInline(raw string) bool {
	return media.RemoteImageNeedsInline(raw)
}

func sniffedImageType(data []byte) string {
	detected := http.DetectContentType(data)
	if supportedImageType(detected) {
		return detected
	}
	return ""
}

// DataImageURL labels base64 image bytes by their magic header. Callers that
// always prefix image/png make later vision checks reject real JPEG output.
func DataImageURL(b64 string) string {
	mediaType := "image/png"
	if sniffed := sniffedDataImage(b64); sniffed != "" {
		mediaType = sniffed
	}
	return "data:" + mediaType + ";base64," + b64
}

func sniffedDataImage(b64 string) string {
	n := len(b64) - len(b64)%4
	if n > 680 {
		n = 680
	}
	if n < 4 {
		return ""
	}
	raw, err := base64.StdEncoding.DecodeString(b64[:n])
	if err != nil {
		return ""
	}
	return sniffedImageType(raw)
}

// Apply orientation through a read-only view, avoiding a second full-size
// allocation. JPEG re-encoding otherwise loses the source's EXIF orientation.
func orientTextImage(source image.Image, body []byte) image.Image {
	orientation := textJPEGOrientation(body)
	if orientation < 2 || orientation > 8 {
		return source
	}
	return textOrientedImage{Image: source, orientation: orientation}
}

// Read only the inline SHORT orientation in IFD0, never arbitrary TIFF tags,
// external offsets or linked directories. Malicious EXIF counts cannot trigger
// allocations or recursive directory traversal.
func textJPEGOrientation(body []byte) int {
	if len(body) < 2 || body[0] != 0xff || body[1] != 0xd8 {
		return 1
	}
	for offset := 2; offset < len(body); {
		if body[offset] != 0xff {
			return 1
		}
		for offset < len(body) && body[offset] == 0xff {
			offset++
		}
		if offset >= len(body) {
			return 1
		}
		marker := body[offset]
		offset++
		if marker == 0xda || marker == 0xd9 { // Stop at scan data or EOI.
			return 1
		}
		if marker == 0x01 || marker >= 0xd0 && marker <= 0xd7 {
			continue
		}
		if len(body)-offset < 2 {
			return 1
		}
		size := int(binary.BigEndian.Uint16(body[offset:]))
		if size < 2 || size > len(body)-offset {
			return 1
		}
		segment := body[offset+2 : offset+size]
		if marker == 0xe1 && bytes.HasPrefix(segment, []byte("Exif\x00\x00")) {
			return textTIFFOrientation(segment[6:])
		}
		offset += size
	}
	return 1
}

func textTIFFOrientation(body []byte) int {
	if len(body) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(body[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(body[2:]) != 42 {
		return 1
	}
	offset := uint64(order.Uint32(body[4:]))
	if offset < 8 || offset+2 > uint64(len(body)) {
		return 1
	}
	entries := body[int(offset):]
	count := int(order.Uint16(entries))
	entries = entries[2:]
	if count > len(entries)/12 {
		return 1
	}
	for i := 0; i < count; i++ {
		entry := entries[i*12 : i*12+12]
		if order.Uint16(entry) != 0x0112 || order.Uint16(entry[2:]) != 3 || order.Uint32(entry[4:]) != 1 {
			continue
		}
		if value := int(order.Uint16(entry[8:])); value >= 1 && value <= 8 {
			return value
		}
	}
	return 1
}

type textOrientedImage struct {
	image.Image
	orientation int
}

func (im textOrientedImage) Bounds() image.Rectangle {
	b := im.Image.Bounds()
	if im.orientation >= 5 {
		return image.Rect(0, 0, b.Dy(), b.Dx())
	}
	return image.Rect(0, 0, b.Dx(), b.Dy())
}

func (im textOrientedImage) At(x, y int) color.Color {
	b := im.Image.Bounds()
	w, h := b.Dx(), b.Dy()
	switch im.orientation {
	case 2:
		x = w - 1 - x
	case 3:
		x, y = w-1-x, h-1-y
	case 4:
		y = h - 1 - y
	case 5:
		x, y = y, x
	case 6:
		x, y = y, h-1-x
	case 7:
		x, y = w-1-y, h-1-x
	case 8:
		x, y = w-1-y, x
	}
	return im.Image.At(b.Min.X+x, b.Min.Y+y)
}

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
