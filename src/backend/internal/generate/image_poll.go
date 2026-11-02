package generate

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type keyedImageTask struct {
	recordID, taskID, status, result, reason string
	found                                    bool
}

func lookupImageTaskByKey(cfg config.Config, r *http.Request, key string) (keyedImageTask, error) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return keyedImageTask{}, err
	}
	defer db.Close()
	return readImageSubmission(r.Context(), db, workspaceOf(r), key)
}

func readImageSubmission(ctx context.Context, db *sql.DB, workspace, key string) (keyedImageTask, error) {
	var recordID, taskID, status, result, reason sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "id", "taskId", "status", "resultUrl", "failReason" FROM "ImageTask"
		WHERE "workspaceId" = ? AND "idempotencyKey" = ?
			AND COALESCE(NULLIF("mediaType", ''), 'image') = 'image'
		ORDER BY "createdAt" DESC LIMIT 1`, workspace, key).Scan(&recordID, &taskID, &status, &result, &reason)
	if err == sql.ErrNoRows {
		return keyedImageTask{}, nil
	}
	if err != nil {
		return keyedImageTask{}, err
	}
	return keyedImageTask{recordID.String, taskID.String, status.String, result.String, reason.String, true}, nil
}

func imageTaskStillSubmitting(taskID string) bool {
	return taskID == "" || strings.HasPrefix(taskID, "pending_")
}

func writeDirectImagePoll(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "taskId": taskID, "error": "查询同步任务失败，请稍后重试"})
		return
	}
	defer db.Close()
	state, result, reason, usage, ok, queryErr := taskStatus(r.Context(), db, scopeOf(r, "image"), taskID)
	if queryErr != nil || !ok {
		if queryErr == nil && !ok {
			httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "taskId": taskID, "error": "未找到同步任务记录"})
			return
		}
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "taskId": taskID, "error": "查询同步任务失败，请稍后重试"})
		return
	}
	if result != "" {
		body := map[string]any{
			"success": true, "taskId": taskID, "status": "SUCCESS", "progress": "100%",
			"resultUrl": result, "failReason": "",
		}
		putStoredUsage(body, usage)
		httpx.WriteJSON(w, http.StatusOK, body)
		return
	}
	failReason := "同步任务未返回结果图"
	failState := "FAILURE"
	if state == "FAILURE" {
		failReason = "同步任务失败"
		if reason != "" {
			failReason = reason
		}
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "status": failState, "progress": "0%",
		"resultUrl": "", "failReason": failReason,
	}
	putStoredUsage(body, usage)
	httpx.WriteJSON(w, http.StatusOK, body)
}
