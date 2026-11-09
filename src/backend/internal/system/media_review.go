package system

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

const mediaReviewTTL = 7 * 24 * time.Hour

type mediaReviewRecord struct {
	URL      string `json:"url"`
	Source   any    `json:"source"`
	State    string `json:"state"`
	QueuedAt string `json:"queuedAt"`
}

func mediaReviewHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dir := filepath.Join(cfg.MediaReviewRoot(), httpx.WorkspaceFrom(r))
		entries, err := os.ReadDir(dir)
		items := []mediaReviewRecord{}
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
					continue
				}
				raw, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
				if readErr != nil {
					continue
				}
				var record mediaReviewRecord
				if json.Unmarshal(raw, &record) != nil || record.URL == "" {
					continue
				}
				items = append(items, record)
			}
		}
		sortMediaReviews(items)
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "count": len(items), "items": items})
	}
}

func sortMediaReviews(items []mediaReviewRecord) {
	for i := 1; i < len(items); i++ {
		item := items[i]
		j := i
		for j > 0 && items[j-1].QueuedAt > item.QueuedAt {
			items[j] = items[j-1]
			j--
		}
		items[j] = item
	}
}

// PurgeExpiredMediaReviews deletes review records older than seven days.
func PurgeExpiredMediaReviews(root string, now time.Time) int {
	if root == "" {
		return 0
	}
	dirs := []string{root}
	entries, _ := os.ReadDir(root)
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, filepath.Join(root, entry.Name()))
		}
	}
	purged := 0
	for _, dir := range dirs {
		names, _ := os.ReadDir(dir)
		for _, name := range names {
			if name.IsDir() || filepath.Ext(name.Name()) != ".json" {
				continue
			}
			file := filepath.Join(dir, name.Name())
			raw, err := os.ReadFile(file)
			if err != nil {
				continue
			}
			var record struct {
				QueuedAt string `json:"queuedAt"`
			}
			if json.Unmarshal(raw, &record) != nil {
				_ = os.Remove(file)
				purged++
				continue
			}
			queued, err := time.Parse(time.RFC3339, record.QueuedAt)
			if err != nil || now.Sub(queued) >= mediaReviewTTL {
				if os.Remove(file) == nil {
					purged++
				}
			}
		}
	}
	return purged
}

func memoryCleanupHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Production() && !httpx.TokenMatches(httpx.RequestToken(r), strings.TrimSpace(cfg.AdminToken)) {
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"success": false, "error": "清理全局内存缓存需要管理员令牌"})
			return
		}
		var before runtime.MemStats
		runtime.ReadMemStats(&before)
		cleared := proxyCache.Clear()
		wal := checkpointWAL(cfg)
		var after runtime.MemStats
		runtime.ReadMemStats(&after)
		freed := int64(0)
		if before.Sys > after.Sys {
			freed = int64(before.Sys - after.Sys)
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":      true,
			"before":       memSnapshot(before),
			"after":        memSnapshot(after),
			"freedBytes":   freed,
			"walResult":    wal,
			"gcRun":        false,
			"cacheCleared": cleared,
			"cache":        proxyCache.Stats(),
			"message":      "已清理代理缓存，Go 运行时保留内存 " + strconv.Itoa(int(after.Sys/1024/1024)) + "MB；WAL 检查点结果见 walResult（null 表示未执行或失败）",
		})
	}
}

func memSnapshot(stats runtime.MemStats) map[string]uint64 {
	return map[string]uint64{
		// rss is a deprecated compatibility alias, never a measured process RSS.
		"rss": stats.Sys, "runtimeSys": stats.Sys, "heapUsed": stats.Alloc, "heapTotal": stats.HeapSys, "external": stats.OtherSys,
	}
}

func checkpointWAL(cfg config.Config) any {
	path := cfg.SQLiteFile()
	if path == "" {
		return nil
	}
	db, err := database.OpenWrite(path)
	if err != nil {
		return nil
	}
	defer db.Close()
	var busy, log, checkpointed int
	err = db.QueryRow(`PRAGMA wal_checkpoint(TRUNCATE)`).Scan(&busy, &log, &checkpointed)
	if err != nil {
		return nil
	}
	return map[string]int{"busy": busy, "log": log, "checkpointed": checkpointed}
}
