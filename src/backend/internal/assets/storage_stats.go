package assets

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func storageStatsHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dataDir := cfg.DataDir()
		cacheRoot := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR"))
		if cacheRoot == "" && dataDir != "" {
			cacheRoot = filepath.Join(dataDir, "storage")
		}
		dbPath := cfg.SQLiteFile()
		if dbPath == "" && dataDir != "" {
			dbPath = filepath.Join(dataDir, "azhuo.db")
		}
		storageDir := cacheRoot
		if storageDir == "" && dataDir != "" {
			storageDir = filepath.Join(dataDir, "storage")
		}
		derivedDir := ""
		if storageDir != "" {
			derivedDir = filepath.Join(storageDir, "derived")
		}
		dbBytes := 0
		dbReadable := false
		if info, err := os.Stat(dbPath); err == nil && !info.IsDir() {
			dbBytes = int(info.Size())
			dbReadable = true
		}
		counts := database.RecordCounts{}
		if dbReadable {
			if loaded, err := database.CountRecords(dbPath, httpx.WorkspaceFrom(r)); err == nil {
				counts = loaded
			}
		}
		storageBytes, storageFiles := dirStats(storageDir)
		derivedBytes, derivedFiles := dirStats(derivedDir)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":        true,
			"imageTaskCount": counts.ImageTaskCount, "productCount": counts.ProductCount,
			"sceneCount": counts.SceneCount, "outfitCount": counts.OutfitCount,
			"actionCount": counts.ActionCount, "personaCount": counts.PersonaCount,
			"styleRecipeCount": counts.StyleRecipeCount, "assistantThreadCount": counts.AssistantThreadCount,
			"promptRecordCount": counts.PromptRecordCount,
			"promptAssetsTotal": counts.SceneCount + counts.OutfitCount + counts.ActionCount + counts.PersonaCount,
			"dbBytes":           dbBytes, "dbPath": dbPath, "dbReadable": dbReadable,
			"storageDirBytes": storageBytes, "storageFileCount": storageFiles,
			"derivedDirBytes": derivedBytes, "derivedFileCount": derivedFiles,
			"cacheRoot": cacheRoot, "dataDir": dataDir,
		})
	}
}

func dirStats(dir string) (int, int) {
	if dir == "" {
		return 0, 0
	}
	bytes := 0
	files := 0
	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		info, statErr := entry.Info()
		if statErr != nil {
			return nil
		}
		files++
		bytes += int(info.Size())
		return nil
	})
	return bytes, files
}
