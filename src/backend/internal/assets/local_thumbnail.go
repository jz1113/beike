package assets

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
	"github.com/rwcarlsen/goexif/exif"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

var localThumbs = media.NewProxyCache(32<<20, 1024, 30*time.Minute, 3)

// Called only after the original file passes workspace and expiry checks.
func serveLocalThumbnail(w http.ResponseWriter, r *http.Request, file *os.File, info os.FileInfo) bool {
	if r.URL.Query().Get("thumb") != "1" || info.Size() > 48<<20 {
		return false
	}
	width, err := strconv.Atoi(r.URL.Query().Get("w"))
	if err != nil || width < 80 || width > 1920 {
		return false
	}
	key := fmt.Sprintf("%s:%d:%d:%d", file.Name(), info.ModTime().UnixNano(), info.Size(), width)
	body, typ, ok := localThumbs.Fetch(r.Context(), key, func() ([]byte, string, bool) {
		reader := func() io.Reader { return io.NewSectionReader(file, 0, info.Size()) }
		cfg, format, err := image.DecodeConfig(reader())
		if err != nil || (format != "jpeg" && format != "png" && format != "webp") || cfg.Height <= 0 || cfg.Width <= 0 || cfg.Width > 40_000_000/cfg.Height {
			return nil, "", false
		}
		edge := max(cfg.Width, cfg.Height)
		if edge <= width {
			return nil, "", false
		}
		if format == "jpeg" {
			// Preserve browser EXIF rotation for photos that require it.
			if metadata, err := exif.Decode(reader()); err == nil {
				if orientation, err := metadata.Get(exif.Orientation); err == nil {
					if n, _ := orientation.Int(0); n > 1 {
						return nil, "", false
					}
				}
			}
		}
		src, _, err := image.Decode(reader())
		if err != nil {
			return nil, "", false
		}
		dst := image.NewRGBA(image.Rect(0, 0, max(1, cfg.Width*width/edge), max(1, cfg.Height*width/edge)))
		draw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)
		var output bytes.Buffer
		if !dst.Opaque() {
			err = png.Encode(&output, dst)
			return output.Bytes(), "image/png", err == nil
		}
		err = jpeg.Encode(&output, dst, &jpeg.Options{Quality: 82})
		return output.Bytes(), "image/jpeg", err == nil
	})
	if !ok {
		return false
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "thumbnail", info.ModTime(), bytes.NewReader(body))
	return true
}
