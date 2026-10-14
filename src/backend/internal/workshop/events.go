package workshop

import (
	"encoding/json"
	"io"
	"net/http"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func BatchEvent(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !batchIDPattern.MatchString(id) {
			writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "批次事件格式不正确", "bad_request")
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeFail(w, http.StatusBadRequest, "批次事件格式不正确", "bad_request")
			return
		}
		revision, ok := whole(payload["revision"])
		event, eventOK := payload["event"].(map[string]any)
		if !ok || revision < 1 || !eventOK || !validEvent(event) {
			writeFail(w, http.StatusBadRequest, "批次事件格式不正确", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := database.GetWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id)
		if err != nil || row.ID == "" {
			writeFail(w, http.StatusNotFound, "批次不存在或已删除", "not_found")
			return
		}
		if row.Revision != revision {
			writeFail(w, http.StatusConflict, "当前批次已在其他窗口更新，请重新加载后继续", "conflict")
			return
		}
		if row.Status == "archived" {
			writeFail(w, http.StatusConflict, "历史批次为只读内容，请复制为新批次后再编辑", "conflict")
			return
		}
		var snapshot map[string]any
		if json.Unmarshal([]byte(row.Snapshot), &snapshot) != nil {
			writeFail(w, http.StatusBadRequest, "批次事件格式不正确", "bad_request")
			return
		}
		next, message, code := applyBatchEvent(snapshot, event)
		if message != "" {
			writeFail(w, http.StatusConflict, message, code)
			return
		}
		encoded, err := json.Marshal(snapshot)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		savedRevision, updatedAt, err := database.WriteWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id, revision, string(encoded), next)
		if err != nil {
			writeFail(w, http.StatusConflict, err.Error(), "conflict")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "revision": savedRevision, "updatedAt": updatedAt, "status": next, "snapshot": snapshot,
		})
	})
}

func validEvent(event map[string]any) bool {
	kind, _ := event["type"].(string)
	switch kind {
	case "START_COLLECTION", "COLLECTION_FINISHED", "SUBMIT_OUTPUT_REVIEW", "COMPLETE_BATCH", "CANCEL_BATCH", "ARCHIVE_BATCH":
		return true
	case "CONFIRM_PLAN":
		value, ok := whole(event["planRevision"])
		return ok && value >= 0
	case "APPROVE_STORYBOARD":
		value, ok := whole(event["storyboardRevision"])
		return ok && value >= 0
	case "START_ANALYSIS", "START_GENERATION", "PAUSE_RUN", "RESUME_RUN":
		runID, _ := event["runId"].(string)
		return runID != ""
	case "ANALYSIS_FINISHED", "GENERATION_FINISHED":
		result, _ := event["result"].(string)
		return result == "success" || result == "partial_failed"
	default:
		return false
	}
}

func applyBatchEvent(snapshot map[string]any, event map[string]any) (string, string, string) {
	kind, _ := event["type"].(string)
	pipeline, _ := snapshot["pipeline"].(map[string]any)
	if pipeline == nil {
		pipeline = map[string]any{}
	}
	status, _ := pipeline["status"].(string)
	if status == "review" {
		status = "review_required"
	}
	if status == "" {
		status = "draft"
	}
	if kind == "COMPLETE_BATCH" {
		if message := completeGate(snapshot); message != "" {
			return "", message, "gate_blocked"
		}
	}
	next, pausedFrom, reason := reduceBatch(status, kind, event, pipeline)
	if reason != "" {
		return "", reason, "illegal_transition"
	}
	pipeline["status"] = next
	if next == "paused" {
		pipeline["pausedFrom"] = pausedFrom
	}
	if kind == "RESUME_RUN" {
		delete(pipeline, "pausedFrom")
	}
	if kind == "CONFIRM_PLAN" {
		pipeline["planRevision"], _ = whole(event["planRevision"])
	}
	if kind == "APPROVE_STORYBOARD" {
		pipeline["storyboardRevision"], _ = whole(event["storyboardRevision"])
	}
	snapshot["pipeline"] = pipeline
	snapshot["currentStage"] = viewStage(next)
	return next, "", ""
}

func completeGate(snapshot map[string]any) string {
	items, _ := snapshot["items"].([]any)
	unfinished := 0
	recovery := 0
	for _, item := range items {
		product, ok := item.(map[string]any)
		if !ok {
			continue
		}
		selected := product["selected"] != false
		skipped, _ := product["skipped"].(bool)
		accepted := 0
		tasks, _ := product["tasks"].([]any)
		for _, rawTask := range tasks {
			task, ok := rawTask.(map[string]any)
			if !ok || task["resultStatus"] == "superseded" {
				continue
			}
			if task["status"] != "SUCCESS" && task["status"] != "FAILURE" {
				unfinished++
			}
			if task["recoveryRequired"] == true {
				recovery++
			}
			if task["outputReview"] == "accepted" {
				accepted++
			}
		}
		if selected && !skipped && accepted < 1 {
			id, _ := product["id"].(string)
			return "商品 " + id + " 至少需要一个采用结果，或明确跳过"
		}
	}
	if unfinished > 0 {
		return "还有任务未进入终态"
	}
	if recovery > 0 {
		return "有任务状态未知，需确认后再完成批次"
	}
	return ""
}

func viewStage(status string) int {
	switch status {
	case "draft", "collecting":
		return 1
	case "plan_ready":
		return 2
	case "analyzing", "review_required", "approved":
		return 3
	default:
		return 4
	}
}
