package generate

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func pollImageTask(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) {
	if body, status, ok := savedTerminal(cfg, r, taskID, "生图任务失败"); ok {
		httpx.WriteJSON(w, status, body)
		return
	}
	base, apiKey := pollCredentials(cfg, r)
	protocol := resolveImageProtocol(base, r.Header.Get("x-custom-protocol"))
	template := imageTemplateForPoll(base, taskID, r.Header.Get("x-request-template"))
	parsed, data, ok := protocol.Poll(imagePollRequest{
		HTTP: r, Base: base, APIKey: apiKey, TaskID: taskID, Model: r.URL.Query().Get("model"), Template: template,
	})
	if !ok {
		writeProbeMiss(cfg, w, r, taskID, "生图任务失败", "暂时无法查询云端任务状态")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, polledTaskBody(r.Context(), cfg, taskID, parsed, data))
}

type pollParsed struct {
	status, result, reason, progress string
}

func parseImagePoll(data map[string]any) (pollParsed, bool) {
	result := firstImageURL(data)
	rawStatus := strings.ToUpper(nestedStatus(data))
	switch {
	case isOngoing(rawStatus):
		return pollParsed{status: "IN_PROGRESS", progress: progressText(data)}, true
	case result != "" && (rawStatus == "" || isSuccess(rawStatus)):
		return pollParsed{status: "SUCCESS", result: result, progress: "100%"}, true
	case isFailure(rawStatus):
		reason := nestedText(data, "fail_reason", "failReason", "message")
		if reason == "" {
			reason = "上游明确返回任务失败"
		}
		return pollParsed{status: "FAILURE", reason: reason, progress: "0%"}, true
	case rawStatus != "":
		return pollParsed{status: "IN_PROGRESS", progress: progressText(data)}, true
	default:
		return pollParsed{}, result != ""
	}
}

func savedTerminal(cfg config.Config, r *http.Request, taskID, failedFallback string) (map[string]any, int, bool) {
	if r.URL.Query().Get("recheck_failed") == "1" {
		return nil, 0, false
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return nil, 0, false
	}
	defer db.Close()
	status, result, reason, usage, ok, queryErr := taskStatus(r.Context(), db, taskID)
	if queryErr != nil || !ok {
		return nil, 0, false
	}
	if status != "SUCCESS" && status != "FAILURE" {
		return nil, 0, false
	}
	progress := "0%"
	if status == "SUCCESS" {
		progress = "100%"
	}
	if status == "FAILURE" && reason == "" {
		reason = failedFallback
	}
	body := map[string]any{"success": true, "taskId": taskID, "status": status, "progress": progress, "resultUrl": result, "failReason": reason}
	putStoredUsage(body, usage)
	return body, http.StatusOK, true
}

func writeProbeMiss(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID, failedFallback, queryError string) {
	db, err := openTaskDB(cfg)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "taskId": taskID, "error": "查询任务状态失败，请稍后重试"})
		return
	}
	defer db.Close()
	status, result, reason, usage, ok, queryErr := taskStatus(r.Context(), db, taskID)
	if queryErr != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "taskId": taskID, "error": "查询任务状态失败，请稍后重试"})
		return
	}
	if ok && result != "" {
		body := map[string]any{"success": true, "taskId": taskID, "status": "SUCCESS", "progress": "100%", "resultUrl": result, "failReason": ""}
		putStoredUsage(body, usage)
		httpx.WriteJSON(w, http.StatusOK, body)
		return
	}
	if ok && status == "FAILURE" {
		if reason == "" {
			reason = failedFallback
		}
		body := map[string]any{"success": true, "taskId": taskID, "status": "FAILURE", "progress": "0%", "resultUrl": "", "failReason": reason}
		putStoredUsage(body, usage)
		httpx.WriteJSON(w, http.StatusOK, body)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskId": taskID, "status": "QUERY_FAILED", "retryable": true, "error": queryError})
}

func pollCredentials(cfg config.Config, r *http.Request) (string, string) {
	model := r.URL.Query().Get("model")
	if model == "openai/gpt-image-2" {
		return lianchiImageBase, strings.TrimSpace(r.Header.Get("x-lianchi-api-key"))
	}
	clientBase := strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	base := ImageDefaultBase()
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	payload := map[string]json.RawMessage{}
	return base, imageAPIKey(cfg, r, payload, clientBase)
}

func firstImageURL(value any) string {
	switch typed := value.(type) {
	case string:
		if regexp.MustCompile(`(?i)^(https?:\/\/|\/\/|\/storage\/|data:image\/)`).MatchString(strings.TrimSpace(typed)) {
			return strings.TrimSpace(typed)
		}
	case []any:
		for _, item := range typed {
			if found := firstImageURL(item); found != "" {
				return found
			}
		}
	case map[string]any:
		for _, key := range []string{"resultUrl", "url", "image_url"} {
			if found := firstImageURL(typed[key]); found != "" {
				return found
			}
		}
		if b64, ok := typed["b64_json"].(string); ok && b64 != "" {
			return gateway.DataImageURL(b64)
		}
		for _, key := range []string{"data", "result", "output", "outputs", "images"} {
			if found := firstImageURL(typed[key]); found != "" {
				return found
			}
		}
	}
	return ""
}

func nestedStatus(data map[string]any) string {
	if nested, ok := data["data"].(map[string]any); ok {
		if text, ok := nested["status"].(string); ok && text != "" {
			return text
		}
	}
	if text, ok := data["status"].(string); ok {
		return text
	}
	return ""
}

func nestedText(data map[string]any, keys ...string) string {
	nodes := []map[string]any{data}
	if nested, ok := data["data"].(map[string]any); ok {
		nodes = append(nodes, nested)
	}
	for _, node := range nodes {
		for _, key := range keys {
			if text, ok := node[key].(string); ok && text != "" {
				return text
			}
		}
	}
	return ""
}

func progressText(data map[string]any) string {
	raw, ok := data["progress"]
	if !ok {
		if nested, exists := data["data"].(map[string]any); exists {
			raw = nested["progress"]
		}
	}
	switch value := raw.(type) {
	case float64:
		return Itoa(int(value)) + "%"
	case string:
		value = strings.TrimSpace(value)
		if value == "" {
			return ""
		}
		if strings.HasSuffix(value, "%") {
			return value
		}
		return value + "%"
	default:
		return ""
	}
}

func isOngoing(status string) bool {
	switch status {
	case "NOT_START", "SUBMITTED", "IN_PROGRESS", "PENDING", "PROCESSING", "QUEUED", "RUNNING":
		return true
	default:
		return false
	}
}

func isSuccess(status string) bool {
	switch status {
	case "SUCCESS", "SUCCEEDED", "COMPLETED", "FINISHED", "DONE":
		return true
	default:
		return false
	}
}

func isFailure(status string) bool {
	switch status {
	case "FAILURE", "FAILED", "ERROR", "CANCELLED", "CANCELED", "EXPIRED":
		return true
	default:
		return false
	}
}
