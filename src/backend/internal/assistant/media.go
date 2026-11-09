package assistant

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"github.com/rwcarlsen/goexif/exif"
	_ "golang.org/x/image/bmp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	videoAttachmentLimit = 100_000_000
	imageAttachmentLimit = 6_000_000
	attachmentLifetime   = 7 * 24 * time.Hour
)

func Media(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = cfg
		mimeType := strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0]))
		video := mimeType == "video/mp4" || mimeType == "video/quicktime" || mimeType == "video/webm"
		if strings.HasPrefix(mimeType, "video/") && !video {
			httpx.WriteJSON(w, http.StatusUnsupportedMediaType, map[string]any{"error": "目前支持 MP4、MOV 和 WebM 视频"})
			return
		}
		limit := imageAttachmentLimit
		if video {
			limit = videoAttachmentLimit
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, int64(limit)+1))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件读取失败，请重试"})
			return
		}
		if len(body) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件内容不能为空"})
			return
		}
		if len(body) > limit {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "附件大小超过上限"})
			return
		}
		if video {
			extension := "mp4"
			valid := len(body) >= 12 && videoBox(body[4:8])
			if mimeType == "video/webm" {
				extension = "webm"
				valid = len(body) >= 4 && binary.BigEndian.Uint32(body[:4]) == 0x1A45DFA3
			} else if mimeType == "video/quicktime" {
				extension = "mov"
			}
			if !valid {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "视频内容与文件格式不匹配"})
				return
			}
			saveAttachment(w, r, body, extension)
			return
		}
		prepared, err := prepareAttachmentImage(body)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
			return
		}
		saveAttachment(w, r, prepared, "jpg")
	})
}

func saveAttachment(w http.ResponseWriter, r *http.Request, body []byte, extension string) {
	expires := time.Now().Add(attachmentLifetime).UnixMilli()
	relative := storage.WorkspaceKey("assistant-attachments/"+itoa64(expires)+"-"+randomID()+"."+extension, httpx.WorkspaceFrom(r))
	root := storage.ResolveRoot()
	if resolved, err := filepath.EvalSymlinks(root); err == nil {
		root = resolved
	}
	target := storage.SafeWithin(root, relative)
	if target == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	_, writeErr := file.Write(body)
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(target)
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "附件保存失败，请重新载入后重试"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "url": "/storage/" + relative, "expiresAt": expires})
}

func videoBox(box []byte) bool {
	name := string(box)
	return name == "ftyp" || name == "moov" || name == "mdat" || name == "wide"
}

func randomID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "attachment"
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:])
}

func itoa64(value int64) string {
	return fmt.Sprintf("%d", value)
}

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
