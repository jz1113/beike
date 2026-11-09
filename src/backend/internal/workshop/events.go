package workshop

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"encoding/json"
	"io"
	"math"
	"net/http"
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := dbworkshop.GetWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id)
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
		savedRevision, updatedAt, err := dbworkshop.WriteWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id, revision, string(encoded), next)
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

var batchTransitions = map[string][]string{
	"START_COLLECTION":     {"draft", "plan_ready"},
	"COLLECTION_FINISHED":  {"collecting"},
	"CONFIRM_PLAN":         {"collecting", "plan_ready"},
	"START_ANALYSIS":       {"plan_ready", "review_required", "approved", "partial_failed"},
	"ANALYSIS_FINISHED":    {"analyzing"},
	"APPROVE_STORYBOARD":   {"review_required", "approved"},
	"START_GENERATION":     {"approved", "qc_required", "partial_failed"},
	"GENERATION_FINISHED":  {"generating"},
	"SUBMIT_OUTPUT_REVIEW": {"generating", "qc_required", "partial_failed"},
	"COMPLETE_BATCH":       {"qc_required"},
	"PAUSE_RUN":            {"collecting", "analyzing", "generating"},
	"RESUME_RUN":           {"paused"},
	"ARCHIVE_BATCH":        {"completed", "cancelled"},
}

func reduceBatch(status, kind string, event, pipeline map[string]any) (string, string, string) {
	if kind == "CANCEL_BATCH" {
		if status == "completed" || status == "archived" || status == "cancelled" {
			return "", "", "状态 " + status + " 不允许取消"
		}
		return "cancelled", "", ""
	}
	allowed := batchTransitions[kind]
	if len(allowed) > 0 && !containsStatus(allowed, status) {
		return "", "", "状态 " + status + " 不允许事件 " + kind
	}
	switch kind {
	case "START_COLLECTION":
		return "collecting", "", ""
	case "COLLECTION_FINISHED", "CONFIRM_PLAN":
		return "plan_ready", "", ""
	case "START_ANALYSIS":
		return "analyzing", "", ""
	case "ANALYSIS_FINISHED":
		if event["result"] == "partial_failed" {
			return "partial_failed", "", ""
		}
		return "review_required", "", ""
	case "APPROVE_STORYBOARD":
		return "approved", "", ""
	case "START_GENERATION":
		return "generating", "", ""
	case "GENERATION_FINISHED":
		if event["result"] == "partial_failed" {
			return "partial_failed", "", ""
		}
		return "qc_required", "", ""
	case "SUBMIT_OUTPUT_REVIEW":
		return "qc_required", "", ""
	case "COMPLETE_BATCH":
		return "completed", "", ""
	case "PAUSE_RUN":
		if status != "collecting" && status != "analyzing" && status != "generating" {
			return "", "", "状态 " + status + " 不允许暂停"
		}
		return "paused", status, ""
	case "RESUME_RUN":
		paused, _ := pipeline["pausedFrom"].(string)
		if paused != "collecting" && paused != "analyzing" && paused != "generating" {
			return "", "", "暂停前状态未知，无法续跑"
		}
		return paused, "", ""
	case "ARCHIVE_BATCH":
		return "archived", "", ""
	default:
		return "", "", "批次事件格式不正确"
	}
}

func containsStatus(values []string, status string) bool {
	for _, value := range values {
		if value == status {
			return true
		}
	}
	return false
}

func prepareSnapshot(raw map[string]any, mode string) string {
	version, ok := whole(raw["version"])
	if !ok || (version != 1 && version != 2) {
		return "工作区格式不正确"
	}
	snapshotMode, _ := raw["mode"].(string)
	if snapshotMode != mode {
		return "工作区模式不一致"
	}
	stage, ok := whole(raw["currentStage"])
	if !ok || stage < 1 || stage > 4 {
		return "工作区格式不正确"
	}
	text, ok := raw["batchInputText"].(string)
	if !ok || len([]rune(text)) > 100000 {
		return "工作区格式不正确"
	}
	items, ok := raw["items"].([]any)
	if !ok || len(items) > 200 {
		return "工作区格式不正确"
	}
	settings, ok := raw["settings"].(map[string]any)
	if !ok || !validSettings(settings) {
		return "工作区格式不正确"
	}
	if version == 2 {
		pipeline, ok := raw["pipeline"].(map[string]any)
		if !ok || !validPipeline(pipeline) {
			return "工作区格式不正确"
		}
		return ""
	}
	raw["version"] = 2
	raw["pipeline"] = map[string]any{
		"status":             legacyStatus(stage, items),
		"planRevision":       0,
		"storyboardRevision": 0,
		"diversityContext": map[string]any{
			"groupSignatures": []any{},
			"actionIds":       []any{},
			"sceneIds":        []any{},
		},
		"runs": []any{},
	}
	return ""
}

func validSettings(settings map[string]any) bool {
	if _, ok := settings["selectedVisionModel"].(string); !ok {
		return false
	}
	if _, ok := settings["selectedImageGenModel"].(string); !ok {
		return false
	}
	if _, ok := settings["selectedArchId"].(string); !ok {
		return false
	}
	if !oneOf(settings["selectedQuality"], "high", "medium", "low") {
		return false
	}
	if !oneOf(settings["selectedAspect"], "3:4", "1:1", "9:16", "16:9") {
		return false
	}
	count, ok := whole(settings["selectedShotCount"])
	if !ok || count < 1 || count > 100 {
		return false
	}
	if _, ok := settings["useAssetLibrary"].(bool); !ok {
		return false
	}
	if !oneOf(settings["generationStrategy"], "grid_first", "single_shot") {
		return false
	}
	return true
}

func validPipeline(pipeline map[string]any) bool {
	return oneOf(pipeline["status"], "draft", "collecting", "plan_ready", "analyzing", "review_required", "approved", "generating", "qc_required", "partial_failed", "paused", "completed", "cancelled", "archived")
}

func legacyStatus(stage int, items []any) string {
	if len(items) == 0 {
		return "draft"
	}
	if stage == 1 {
		return "collecting"
	}
	if stage == 2 {
		return "plan_ready"
	}
	hasStoryboard := false
	generating := false
	failed := false
	taskCount := 0
	succeeded := true
	for _, item := range items {
		product, ok := item.(map[string]any)
		if !ok {
			continue
		}
		prompts, _ := product["prompts"].([]any)
		if len(prompts) > 0 {
			hasStoryboard = true
		}
		tasks, _ := product["tasks"].([]any)
		for _, rawTask := range tasks {
			taskCount++
			task, ok := rawTask.(map[string]any)
			if !ok {
				succeeded = false
				continue
			}
			status, _ := task["status"].(string)
			if status == "PENDING" || status == "IN_PROGRESS" {
				generating = true
			}
			if status == "FAILURE" {
				failed = true
			}
			if status != "SUCCESS" {
				succeeded = false
			}
		}
	}
	succeeded = succeeded && taskCount > 0
	if stage == 3 {
		if hasStoryboard {
			return "review_required"
		}
		return "analyzing"
	}
	if generating {
		return "generating"
	}
	if failed {
		return "partial_failed"
	}
	if succeeded {
		return "qc_required"
	}
	return "generating"
}

func oneOf(value any, options ...string) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	for _, option := range options {
		if text == option {
			return true
		}
	}
	return false
}

func whole(value any) (int, bool) {
	number, ok := value.(float64)
	if !ok || math.Trunc(number) != number {
		return 0, false
	}
	return int(number), true
}
