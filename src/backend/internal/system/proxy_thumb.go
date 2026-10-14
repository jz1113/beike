package system

import (
	"bytes"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"strconv"
)

func proxyThumbWidth(r *http.Request) int {
	thumb := r.URL.Query().Get("thumb") == "1" || r.URL.Query().Get("thumb") == "true"
	raw := r.URL.Query().Get("w")
	if raw == "" {
		if thumb {
			return 640
		}
		return 0
	}
	width, err := strconv.Atoi(raw)
	if err != nil {
		width = 640
	}
	if width < 80 {
		return 80
	}
	if width > 1920 {
		return 1920
	}
	return width
}

func serveCachedProxy(w http.ResponseWriter, r *http.Request, key string) bool {
	cached, ok := proxyCache.Load(key)
	if !ok {
		return false
	}
	entry := cached.(proxyCacheEntry)
	if r.Header.Get("If-None-Match") == entry.etag {
		w.Header().Set("ETag", entry.etag)
		w.Header().Set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	writeProxyBytes(w, entry.contentType, entry.etag, entry.body)
	return true
}

func cachedOrFetch(r *http.Request, imageURL string) ([]byte, string, bool) {
	if cached, ok := proxyCache.Load(imageURL); ok {
		entry := cached.(proxyCacheEntry)
		return entry.body, entry.contentType, true
	}
	body, contentType, ok := fetchProxy(r, imageURL, false)
	if !ok {
		return nil, "", false
	}
	proxyCache.Store(imageURL, proxyCacheEntry{body: body, contentType: contentType, etag: ""})
	return body, contentType, true
}

func resizeProxyThumb(body []byte, width int) ([]byte, string, bool) {
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, "", false
	}
	bounds := img.Bounds()
	if bounds.Dx() <= width {
		return nil, "", false
	}
	height := bounds.Dy() * width / bounds.Dx()
	if height < 1 {
		height = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	scaleNearest(dst, img)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, dst, &jpeg.Options{Quality: 82}); err != nil {
		return nil, "", false
	}
	return encoded.Bytes(), "image/jpeg", true
}

func scaleNearest(dst *image.RGBA, src image.Image) {
	bounds := dst.Bounds()
	source := src.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		sy := source.Min.Y + (y-bounds.Min.Y)*source.Dy()/bounds.Dy()
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			sx := source.Min.X + (x-bounds.Min.X)*source.Dx()/bounds.Dx()
			dst.Set(x, y, src.At(sx, sy))
		}
	}
}
