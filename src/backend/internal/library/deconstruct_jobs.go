package library

import (
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"net/http"
	"os"
	"path/filepath"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func deconstructJobsHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobID := r.URL.Query().Get("jobId")
		if len(jobID) > 160 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务 ID 无效"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取后台反推任务失败"})
			return
		}
		defer db.Close()
		if jobID == "" {
			jobs, err := dbworkshop.ListDeconstructJobs(r.Context(), db, httpx.WorkspaceFrom(r), jobStorageRoot(cfg))
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取后台反推任务失败"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "jobs": jobs})
			return
		}
		job, ok, err := dbworkshop.GetDeconstructJob(r.Context(), db, httpx.WorkspaceFrom(r), jobStorageRoot(cfg), jobID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "读取后台反推任务失败"})
			return
		}
		if !ok {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "后台反推任务不存在"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "job": job})
	}
}

func jobStorageRoot(cfg config.Config) string {
	if cache := os.Getenv("AZHUO_CACHE_DIR"); cache != "" {
		return cache
	}
	if data := cfg.DataDir(); data != "" {
		return filepath.Join(data, "storage")
	}
	return ""
}
