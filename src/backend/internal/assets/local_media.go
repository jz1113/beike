package assets

import (
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
	"beike.local/cloud/src/backend/internal/platform/storage"
)

var legacyMediaPattern = regexp.MustCompile(`(?i)^generated/(images|videos)/local/[a-f0-9]{64}\.(png|jpg|jpeg|webp|gif|avif|mp4|webm|mov)$`)
var attachmentExpiryPattern = regexp.MustCompile(`(?:^|/)assistant-attachments/(\d{13})-[a-f0-9-]+\.(?:jpg|mp4|mov|webm)$`)

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
	header := w.Header()
	header.Set("Content-Type", mediaContentType(path))
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
	db, err := httpx.OpenDB(cfg)
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
	switch strings.ToLower(path[strings.LastIndex(path, "."):]) {
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	case ".webm":
		return "video/webm"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}
