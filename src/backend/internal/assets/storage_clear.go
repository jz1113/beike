package assets

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func clearDerivedStorageHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cacheRoot := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR"))
		if cacheRoot == "" {
			if dataDir := cfg.DataDir(); dataDir != "" {
				cacheRoot = filepath.Join(dataDir, "storage")
			}
		}
		derivedDir := ""
		if cacheRoot != "" {
			derivedDir = filepath.Join(cacheRoot, "derived")
		}
		clearedBytes, clearedFiles := clearDerivedDirectory(derivedDir)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "clearedBytes": clearedBytes, "clearedFileCount": clearedFiles,
			"message": "已清理派生磁盘缓存",
		})
	}
}

func clearDerivedDirectory(dir string) (int, int) {
	if dir == "" {
		return 0, 0
	}
	bytes, files := dirStats(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return bytes, files
	}
	removeDirectoryContents(dir)
	return bytes, files
}

func removeDirectoryContents(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		full := filepath.Join(dir, entry.Name())
		info, err := os.Lstat(full)
		if err != nil {
			continue
		}
		if info.IsDir() {
			removeDirectoryContents(full)
			_ = os.Remove(full)
			continue
		}
		_ = os.Remove(full)
	}
}
