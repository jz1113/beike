package workshop

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
