package depth

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

func persistDepthBytes(cfg config.Config, workspace, contentType string, data []byte, filename string) (string, error) {
	ext := "png"
	folder := "generated/images"
	if strings.Contains(contentType, "mp4") || strings.Contains(contentType, "video") {
		ext = "mp4"
		folder = "generated/videos"
	}
	if filename == "" {
		filename = "depth_" + time.Now().UTC().Format("20060102150405") + "." + ext
	}
	relative := workspace + "/azhuo/" + folder + "/" + time.Now().UTC().Format("200601") + "/" + filename
	root := depthStorageRoot(cfg)
	target := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(target, data, 0o644); err != nil {
		return "", err
	}
	return "/storage/" + relative, nil
}

func depthStorageRoot(cfg config.Config) string {
	if cache := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR")); cache != "" {
		return cache
	}
	if data := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); data != "" {
		return filepath.Join(data, "storage")
	}
	if file := cfg.SQLiteFile(); file != "" {
		return filepath.Join(filepath.Dir(file), "storage")
	}
	return filepath.Join(os.TempDir(), "beike-workbench", "storage")
}

func depthTaskID() string {
	var buf [4]byte
	_, _ = rand.Read(buf[:])
	return "depth_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + hex.EncodeToString(buf[:])
}
