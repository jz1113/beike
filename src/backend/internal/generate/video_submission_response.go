package generate

import (
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func videoSubmissionBody(row videoSubmission) map[string]any {
	body := map[string]any{
		"success": true, "taskKey": row.key, "recordId": row.recordID, "model": row.model,
		"prompt": row.prompt, "aspect_ratio": row.ratio, "resolution": row.resolution,
		"status": row.status, "retryable": false,
	}
	pending := imageTaskStillSubmitting(row.taskID)
	if !pending {
		body["taskId"] = row.taskID
	}
	switch {
	case row.status == "FAILURE" && pending:
		body["success"] = false
		body["submissionOutcome"] = "rejected"
		body["submissionRejected"] = true
		body["error"] = row.reason
		body["failReason"] = row.reason
	case row.status == "SUBMISSION_UNKNOWN" || pending:
		body["success"] = false
		body["status"] = "QUERY_FAILED"
		body["submissionOutcome"] = "unknown"
		body["submissionUnknown"] = true
		body["submissionPending"] = row.status != "SUBMISSION_UNKNOWN"
		body["error"] = "原视频提交结果待核实，请查询原任务；不会自动重新提交"
	default:
		body["submissionOutcome"] = "accepted"
		body["resultUrl"] = row.result
		body["failReason"] = row.reason
	}
	return body
}

func writeVideoSubmission(w http.ResponseWriter, row videoSubmission, reused bool) {
	body := videoSubmissionBody(row)
	body["reused"] = reused
	status := http.StatusOK
	if body["submissionOutcome"] == "rejected" {
		status = http.StatusBadRequest
	} else if body["submissionOutcome"] == "unknown" {
		status = http.StatusServiceUnavailable
	}
	httpx.WriteJSON(w, status, body)
}

func pollVideoSubmission(cfg config.Config, w http.ResponseWriter, r *http.Request, key string) {
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 256 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
		return
	}
	row, err := lookupVideoSubmission(cfg, r, key)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
			"success": false, "status": "QUERY_FAILED", "taskKey": key, "retryable": false,
			"submissionUnknown": true, "error": "原视频提交记录暂时无法核对，请稍后查询；不会自动重新提交",
		})
		return
	}
	if !row.found {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": false, "status": "QUERY_FAILED", "taskKey": key, "retryable": false,
			"submissionUnknown": true, "error": "尚未找到原视频提交记录，请稍后核对；不会自动重新提交",
		})
		return
	}
	// The receipt exposes the original upstream ID without depending on upstream
	// availability or credentials. The existing taskId GET continues polling it.
	httpx.WriteJSON(w, http.StatusOK, videoSubmissionBody(row))
}
