package assets

import (
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func assetTasksHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败"})
			return
		}
		defer db.Close()
		if id := r.URL.Query().Get("id"); id != "" {
			task, ok, err := dbworkshop.FindImageTask(r.Context(), db, httpx.WorkspaceFrom(r), id)
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败"})
				return
			}
			if !ok {
				httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "任务不存在"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "task": task})
			return
		}
		page := boundedInt(httpx.QueryInt(r, "page", 1), 1, 1_000_000)
		pageSize := boundedInt(httpx.QueryInt(r, "pageSize", 100), 1, 200)
		total, tasks, err := dbworkshop.ListImageTasks(r.Context(), db, httpx.WorkspaceFrom(r), dbworkshop.TaskQuery{
			ProductID: r.URL.Query().Get("productId"),
			Status:    r.URL.Query().Get("status"),
			Search:    r.URL.Query().Get("search"),
			Detail:    r.URL.Query().Get("detail") == "true" || r.URL.Query().Get("detail") == "1",
			Page:      page,
			PageSize:  pageSize,
		})
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "page": page, "pageSize": pageSize, "total": total, "tasks": tasks})
	}
}

func boundedInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
