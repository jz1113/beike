package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

// VideoBind attaches an upstream task ID the user found in the provider console
// to a submission whose response was never confirmed. It never submits
// generation; the existing taskId GET then polls the bound task.
func VideoBind(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			TaskKey string `json:"taskKey"`
			TaskID  string `json:"taskId"`
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil || json.Unmarshal(raw, &body) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求格式不正确"})
			return
		}
		key, taskID := strings.TrimSpace(body.TaskKey), strings.TrimSpace(body.TaskID)
		if key == "" || len(key) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
			return
		}
		if taskID == "" || len(taskID) > 256 || imageTaskStillSubmitting(taskID) || strings.ContainsAny(taskID, " \t\r\n/?#") {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "上游任务 ID 无效"})
			return
		}
		db, err := openTaskDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "提交记录暂时无法更新，请稍后重试"})
			return
		}
		defer db.Close()
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		// Only an unconfirmed receipt without an upstream ID can be bound, so a
		// confirmed or already-bound task is never redirected to another one.
		result, err := db.ExecContext(r.Context(), `
			UPDATE "ImageTask" SET "taskId" = ?, "status" = 'IN_PROGRESS', "failReason" = NULL, "updatedAt" = ?
			WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'video'
				AND "status" = 'SUBMISSION_UNKNOWN' AND ("taskId" IS NULL OR "taskId" = '' OR "taskId" LIKE 'pending\_%' ESCAPE '\')`,
			taskID, now, workspaceOf(r), key)
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "提交记录暂时无法更新，请稍后重试"})
			return
		}
		if count, _ := result.RowsAffected(); count != 1 {
			httpx.WriteJSON(w, http.StatusConflict, map[string]any{"success": false, "error": "该提交记录无需绑定或已绑定上游任务，请直接查询原任务"})
			return
		}
		row, err := readVideoSubmission(r.Context(), db, workspaceOf(r), key)
		if err != nil || !row.found {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskKey": key, "taskId": taskID, "status": "IN_PROGRESS"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, videoSubmissionBody(row))
	})
}
