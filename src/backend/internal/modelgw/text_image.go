package modelgw

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
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

// OpenAI remote URLs remain provider-fetched URLs, preserving signed URL and
// multi-image request semantics. Only inline data URLs need local preparation;
// native protocols use textImage for both sources because they embed bytes.
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
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return strings.HasSuffix(strings.ToLower(parsed.Path), ".octet-stream")
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
