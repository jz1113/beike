package media

import (
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

// VisionImageURL keeps public URLs intact and embeds local originals for remote models.
func VisionImageURL(root, source string) (string, error) {
	if strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "data:image/") {
		return source, nil
	}
	if root == "" || !strings.HasPrefix(source, "/storage/") {
		return "", errors.New("图片来源无法读取")
	}
	file := storage.SafeWithin(root, strings.TrimPrefix(source, "/storage/"))
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil || file == "" {
		return "", errors.New("图片来源无法读取")
	}
	realFile, err := filepath.EvalSymlinks(file)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(realRoot, realFile)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", errors.New("图片来源超出素材目录")
	}
	handle, err := os.Open(realFile)
	if err != nil {
		return "", err
	}
	defer handle.Close()
	body, err := io.ReadAll(io.LimitReader(handle, (12<<20)+1))
	if err != nil || len(body) == 0 || len(body) > 12<<20 {
		return "", errors.New("本地原图为空或超过 12 MB")
	}
	mime := http.DetectContentType(body)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" && mime != "image/gif" {
		return "", errors.New("请使用 JPEG、PNG、WebP 或 GIF 原图")
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}
