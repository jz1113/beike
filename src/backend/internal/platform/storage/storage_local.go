package storage

import (
	"os"
	"path/filepath"
	"strings"
)

func ResolveRoot() string {
	if cache := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR")); cache != "" {
		return cache
	}
	if data := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); data != "" {
		return filepath.Join(data, "storage")
	}
	if raw := strings.TrimSpace(os.Getenv("DATABASE_URL")); strings.HasPrefix(raw, "file:") {
		dbPath := strings.TrimPrefix(raw, "file:")
		dbPath = strings.TrimPrefix(dbPath, "//")
		abs, err := filepath.Abs(dbPath)
		if err == nil {
			return filepath.Join(filepath.Dir(abs), "storage")
		}
	}
	appData := defaultAppStorageDir()
	if _, err := os.Stat(filepath.Dir(appData)); err == nil {
		return appData
	}
	return filepath.Join(os.TempDir(), "beike-workbench", "storage")
}

func defaultAppStorageDir() string {
	home, _ := os.UserHomeDir()
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	return filepath.Join(appData, "com.azhuo.workbench", "storage")
}

func SafeWithin(root, rel string) string {
	if rel == "" || strings.Contains(rel, "..") {
		return ""
	}
	for _, c := range rel {
		if c < 32 {
			return ""
		}
	}
	cleanRel := filepath.Clean(rel)
	if filepath.IsAbs(cleanRel) || (len(cleanRel) > 1 && cleanRel[1] == ':') {
		return ""
	}
	abs := filepath.Join(root, cleanRel)
	realRoot, err := filepath.Abs(root)
	if err != nil {
		realRoot = root
	}
	realAbs, err := filepath.Abs(abs)
	if err != nil {
		return ""
	}
	if !strings.HasPrefix(realAbs, realRoot+string(filepath.Separator)) && realAbs != realRoot {
		return ""
	}
	return realAbs
}

func StoredFile(rel string) string {
	roots := []string{ResolveRoot()}
	cwd, err := os.Getwd()
	if err == nil {
		roots = append(roots, filepath.Join(cwd, ".azhuo_storage"))
	}
	for _, root := range roots {
		candidate := SafeWithin(root, rel)
		if candidate != "" {
			if stat, err := os.Stat(candidate); err == nil && !stat.IsDir() {
				return candidate
			}
		}
	}
	return ""
}
