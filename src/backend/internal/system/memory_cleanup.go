package system

import (
	"net/http"
	"runtime"
	"strconv"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func memoryCleanupHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
