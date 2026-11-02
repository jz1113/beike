package generate

import (
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type taskScope struct {
	workspace, media string
}

func scopeOf(r *http.Request, media string) taskScope {
	return taskScope{workspaceOf(r), media}
}

// Hosted polling must prove ownership before returning a receipt or contacting
// upstream. Local-only legacy clients may still query unrecorded upstream IDs;
// an ID recorded for a different workspace/media never gets that fallback.
func authorizeTaskPoll(cfg config.Config, w http.ResponseWriter, r *http.Request, media, taskID string) bool {
	db, err := openTaskDB(cfg)
	if err != nil {
		if !cfg.Production() && workspaceOf(r) == "local" {
			return true
		}
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "查询任务状态失败，请稍后重试"})
		return false
	}
	defer db.Close()
	scope := scopeOf(r, media)
	var owned, recorded bool
	err = db.QueryRowContext(r.Context(), `SELECT
		EXISTS(SELECT 1 FROM "ImageTask" WHERE "workspaceId" = ? AND COALESCE(NULLIF("mediaType", ''), 'image') = ? AND "taskId" = ?),
		EXISTS(SELECT 1 FROM "ImageTask" WHERE "taskId" = ?)`, scope.workspace, scope.media, taskID, taskID).Scan(&owned, &recorded)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "查询任务状态失败，请稍后重试"})
		return false
	}
	if owned || (!recorded && !cfg.Production() && scope.workspace == "local") {
		return true
	}
	httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "未找到任务记录"})
	return false
}
