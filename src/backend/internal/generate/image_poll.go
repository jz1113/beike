package generate

import (
	"database/sql"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func lookupImageTaskByKey(cfg config.Config, r *http.Request, key string) (string, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return "", err
	}
	defer db.Close()
	var taskID string
	err = db.QueryRowContext(r.Context(), `
		SELECT "taskId" FROM "ImageTask"
		WHERE "workspaceId" = ? AND "idempotencyKey" = ?
		ORDER BY "createdAt" DESC LIMIT 1`, httpx.WorkspaceFrom(r), key).Scan(&taskID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return taskID, err
}

func writeDirectImagePoll(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "taskId": taskID, "error": "查询同步任务失败，请稍后重试"})
		return
	}
	defer db.Close()
	var resultURL, status, failReason sql.NullString
	err = db.QueryRowContext(r.Context(), `
		SELECT "resultUrl", "status", "failReason" FROM "ImageTask" WHERE "taskId" = ? LIMIT 1`, taskID).
		Scan(&resultURL, &status, &failReason)
	if err == sql.ErrNoRows {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "taskId": taskID, "error": "未找到同步任务记录"})
		return
	}
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "taskId": taskID, "error": "查询同步任务失败，请稍后重试"})
		return
	}
	if resultURL.Valid && resultURL.String != "" {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "taskId": taskID, "status": "SUCCESS", "progress": "100%",
			"resultUrl": resultURL.String, "failReason": "",
		})
		return
	}
	reason := "同步任务未返回结果图"
	state := "FAILURE"
	if status.String == "FAILURE" {
		reason = "同步任务失败"
		if failReason.Valid && failReason.String != "" {
			reason = failReason.String
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "taskId": taskID, "status": state, "progress": "0%",
		"resultUrl": "", "failReason": reason,
	})
}
