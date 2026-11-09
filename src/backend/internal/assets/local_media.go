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
	"regexp"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"github.com/rwcarlsen/goexif/exif"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

var legacyMediaPattern = regexp.MustCompile(`(?i)^generated/(images|videos)/local/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$`)
var attachmentExpiryPattern = regexp.MustCompile(`(?:^|/)assistant-attachments/(\d{13})-[a-f0-9-]+\.(?:jpg|mp4|mov|webm)$`)
var localThumbs = media.NewProxyCache(32<<20, 1024, 30*time.Minute, 3)

func storageHandler(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		serveLocalMedia(cfg, w, r)
	})
}

func serveLocalMedia(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	workspace, status, message := storageAccess(cfg, r)
	if status != 0 {
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/storage/")
	rel = strings.TrimPrefix(rel, "/storage")
	decoded, ok := decodeStorageRel(rel)
	if !ok {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if !storage.WorkspaceRel(decoded, workspace, !cfg.Production()) {
		if !legacyMediaPattern.MatchString(decoded) || !legacyMediaAllowed(cfg, r, workspace, decoded) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
	}
	root := storage.ResolveRoot()
	safe := storage.SafeWithin(root, decoded)
	if safe == "" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	path := safe
	if stored := storage.StoredFile(decoded); stored != "" {
		path = stored
	}
	file, err := os.Open(path)
	if err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	if match := attachmentExpiryPattern.FindStringSubmatch(decoded); match != nil {
		expires, _ := strconv.ParseInt(match[1], 10, 64)
		if expires <= time.Now().UnixMilli() {
			_ = os.Remove(path)
			http.Error(w, "附件已超过 7 天保存期限", http.StatusGone)
			return
		}
	}
	if serveLocalThumbnail(w, r, file, info) {
		return
	}
	header := w.Header()
	contentType := mediaContentType(path)
	header.Set("Content-Type", contentType)
	if contentType == "image/svg+xml" {
		header.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	}
	header.Set("Cache-Control", "private, no-store")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Accept-Ranges", "bytes")
	size := info.Size()
	rangeHeader := ""
	if r.Method == http.MethodGet && r.Header.Get("If-Range") == "" {
		rangeHeader = r.Header.Get("Range")
	}
	start, end, ranged, invalid := parseByteRange(rangeHeader, size)
	if invalid {
		header.Set("Content-Range", "bytes */"+strconv.FormatInt(size, 10))
		header.Set("Content-Length", "0")
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	length := size
	statusCode := http.StatusOK
	if ranged {
		length = end - start + 1
		statusCode = http.StatusPartialContent
		header.Set("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10)+"/"+strconv.FormatInt(size, 10))
	}
	header.Set("Content-Length", strconv.FormatInt(length, 10))
	w.WriteHeader(statusCode)
	if r.Method == http.MethodHead || length == 0 {
		return
	}
	reader := io.NewSectionReader(file, start, length)
	_, _ = io.Copy(w, reader)
}

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

func storageAccess(cfg config.Config, r *http.Request) (string, int, string) {
	if cfg.Production() && strings.TrimSpace(cfg.AccessToken) == "" {
		return "", http.StatusServiceUnavailable, "服务端未配置访问令牌，请联系管理员"
	}
	if cfg.Production() && !httpx.Authorized(r, cfg) {
		return "", http.StatusUnauthorized, "未授权：访问令牌缺失或无效"
	}
	if !cfg.Production() {
		return "local", 0, ""
	}
	workspace, ok := httpx.ResolveWorkspace(r, cfg)
	if !ok {
		return "", http.StatusUnauthorized, "缺少工作区密钥"
	}
	return workspace, 0, ""
}

func legacyMediaAllowed(cfg config.Config, r *http.Request, workspace, rel string) bool {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return false
	}
	defer db.Close()
	owners, err := database.ImageTaskOwners(r.Context(), db, "/storage/"+rel)
	if err != nil {
		return false
	}
	for _, owner := range owners {
		if owner == workspace {
			return true
		}
	}
	return len(owners) == 0
}

func decodeStorageRel(rel string) (string, bool) {
	decoded := rel
	for range 2 {
		next, err := urlPathDecode(decoded)
		if err != nil {
			return "", false
		}
		decoded = next
	}
	return decoded, true
}

func urlPathDecode(value string) (string, error) {
	var builder strings.Builder
	for index := 0; index < len(value); index++ {
		if value[index] != '%' || index+2 >= len(value) {
			builder.WriteByte(value[index])
			continue
		}
		n, err := strconv.ParseUint(value[index+1:index+3], 16, 8)
		if err != nil {
			return "", err
		}
		builder.WriteByte(byte(n))
		index += 2
	}
	return builder.String(), nil
}

func parseByteRange(header string, size int64) (int64, int64, bool, bool) {
	if header == "" {
		return 0, size - 1, false, false
	}
	match := regexp.MustCompile(`(?i)^bytes=(\d*)-(\d*)$`).FindStringSubmatch(strings.TrimSpace(header))
	if match == nil || (match[1] == "" && match[2] == "") || size == 0 {
		return 0, 0, false, true
	}
	if match[1] == "" {
		last, err := strconv.ParseInt(match[2], 10, 64)
		if err != nil || last == 0 {
			return 0, 0, false, true
		}
		start := size - last
		if start < 0 {
			start = 0
		}
		return start, size - 1, true, false
	}
	start, err := strconv.ParseInt(match[1], 10, 64)
	if err != nil || start >= size {
		return 0, 0, false, true
	}
	end := size - 1
	if match[2] != "" {
		parsed, err := strconv.ParseInt(match[2], 10, 64)
		if err != nil || parsed < start {
			return 0, 0, false, true
		}
		if parsed < end {
			end = parsed
		}
	}
	return start, end, true, false
}

func mediaContentType(path string) string {
	dot := strings.LastIndex(path, ".")
	if dot < 0 {
		return "application/octet-stream"
	}
	switch strings.ToLower(path[dot:]) {
	case ".mp4", ".m4v":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".m4a":
		return "audio/mp4"
	case ".aac":
		return "audio/aac"
	case ".ogg", ".oga", ".opus":
		return "audio/ogg"
	case ".flac":
		return "audio/flac"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".avif":
		return "image/avif"
	case ".svg":
		return "image/svg+xml"
	case ".bmp":
		return "image/bmp"
	case ".ico":
		return "image/x-icon"
	case ".heic":
		return "image/heic"
	case ".heif":
		return "image/heif"
	default:
		return "application/octet-stream"
	}
}
