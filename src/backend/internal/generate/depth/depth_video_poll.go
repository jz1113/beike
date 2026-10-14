package depth

import (
	"database/sql"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func depthVideoPoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("taskId") == "" && query.Has("taskKey") {
		status, body := readDepthSubmission(cfg, r, "depth-video")
		httpx.WriteJSON(w, status, body)
		return
	}
	taskID := query.Get("taskId")
	if taskID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 参数"})
		return
	}
	record, found, err := depthVideoRecord(cfg, r, taskID)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查询深度动作捕捉任务失败"})
		return
	}
	if !found {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "任务不存在"})
		return
	}
	runtime, hasRuntime := depthVideoState.Load(record.id)
	status := record.status
	if status == "" {
		status = "IN_PROGRESS"
	}
	failReason := record.failReason
	if !hasRuntime && status == "IN_PROGRESS" && time.Since(record.createdAt) > 45*time.Second {
		status = "FAILURE"
		failReason = "任务执行已超时或已中断"
		markDepthVideo(depthVideoJob{cfg: cfg, recordID: record.id}, "FAILURE", "", failReason)
	}
	progress := "10%"
	body := map[string]any{
		"success": true, "taskId": taskID, "status": status, "resultUrl": record.resultURL,
		"failReason": emptyAsNil(failReason), "quality": record.quality,
	}
	if hasRuntime {
		state := runtime.(depthRuntime)
		progress = state.Progress
		body["stage"] = state.Stage
		if state.Meta.ModelID != "" {
			body["modelId"] = state.Meta.ModelID
			body["inferenceSizePx"] = state.Meta.InferenceSizePx
			body["device"] = state.Meta.Device
		}
		if state.Meta.Quality != "" {
			body["quality"] = state.Meta.Quality
		}
	} else if status == "SUCCESS" {
		progress = "100%"
	} else if status == "FAILURE" {
		progress = "0%"
	}
	body["progress"] = progress
	httpx.WriteJSON(w, http.StatusOK, body)
}

type depthVideoRow struct {
	id         string
	status     string
	resultURL  any
	failReason string
	quality    any
	createdAt  time.Time
}

func depthVideoRecord(cfg config.Config, r *http.Request, taskID string) (depthVideoRow, bool, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return depthVideoRow{}, false, err
	}
	defer db.Close()
	var row depthVideoRow
	var resultURL, failReason, quality, createdAt sql.NullString
	err = db.QueryRowContext(r.Context(), `
		SELECT "id", "status", "resultUrl", "failReason", "quality", "createdAt" FROM "ImageTask"
		WHERE "workspaceId" = ? AND ("id" = ? OR "taskId" = ?)
		LIMIT 1`, httpx.WorkspaceFrom(r), taskID, taskID).Scan(&row.id, &row.status, &resultURL, &failReason, &quality, &createdAt)
	if err == sql.ErrNoRows {
		return depthVideoRow{}, false, nil
	}
	if err != nil {
		return depthVideoRow{}, false, err
	}
	if resultURL.Valid {
		row.resultURL = resultURL.String
	}
	row.failReason = failReason.String
	if quality.Valid {
		row.quality = quality.String
	}
	row.createdAt = parseDepthTime(createdAt.String)
	return row, true, nil
}

func parseDepthTime(raw string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000Z", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed
		}
	}
	return time.Now()
}

func emptyAsNil(value string) any {
	if value == "" {
		return nil
	}
	return value
}
