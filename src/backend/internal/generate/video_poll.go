package generate

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func pollVideoTask(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) {
	if body, status, ok := savedTerminal(cfg, r, taskID, "视频任务失败"); ok {
		httpx.WriteJSON(w, status, body)
		return
	}
	base, apiKey := pollCredentials(cfg, r)
	root := strings.TrimRight(system.NormalizeGatewayBaseURL(base), "/")
	urls := videoPollURLs(root, taskID, r.URL.Query().Get("model"))
	for _, endpoint := range urls {
		status, raw, err := PostModel(r.Context(), http.MethodGet, endpoint, apiKey, nil, 5*time.Second)
		if err != nil || status < 200 || status >= 300 {
			continue
		}
		var data map[string]any
		if json.Unmarshal(raw, &data) != nil || data["error"] != nil {
			continue
		}
		if !videoPollReady(data) {
			continue
		}
		httpx.WriteJSON(w, http.StatusOK, polledTaskBody(r.Context(), cfg, taskID, readVideoPoll(data), data))
		return
	}
	writeProbeMiss(cfg, w, r, taskID, "视频任务失败", "暂时无法查询云端视频任务状态")
}

func videoPollURLs(base, taskID, model string) []string {
	var urls []string
	if template := videoQueryTemplate(base, taskID); template != "" {
		urls = append(urls, strings.ReplaceAll(template, "{taskId}", url.QueryEscape(taskID)))
	}
	_, queries, _ := videoEndpointSet(videoFamily(model), model, nil)
	urls = append(urls, expandVideoURLs(base, queries, url.QueryEscape(taskID))...)
	urls = append(urls, base+"/v1/videos/"+taskID, base+"/v2/videos/generations/"+taskID, base+"/seedance/v3/contents/generations/tasks/"+taskID)
	return uniqueStrings(urls)
}

func videoPollReady(data map[string]any) bool {
	if data["status"] != nil || data["state"] != nil || data["video_url"] != nil || data["url"] != nil || data["output"] != nil || data["content"] != nil || data["creations"] != nil {
		return true
	}
	if nested, ok := data["data"].(map[string]any); ok {
		return nested["status"] != nil || nested["task_status"] != nil || nested["output"] != nil
	}
	return false
}

func readVideoPoll(data map[string]any) pollParsed {
	task := data
	if nested, ok := data["task"].(map[string]any); ok {
		task = nested
	} else if nested, ok := data["data"].(map[string]any); ok {
		task = nested
	} else if nested, ok := data["output"].(map[string]any); ok {
		task = nested
	}
	raw := strings.ToUpper(firstString(task, "task_status", "status", "state"))
	if raw == "" {
		raw = strings.ToUpper(firstString(data, "task_status", "status"))
	}
	if raw == "" {
		raw = "PENDING"
	}
	done := raw == "SUCCESS" || raw == "SUCCEEDED" || raw == "COMPLETED" || raw == "FINISHED" || raw == "DONE" || raw == "SUCCEED"
	progress := "45%"
	if done {
		progress = "100%"
	}
	result := firstString(data, "video_url", "url")
	if result == "" {
		result = firstString(task, "video_url", "url")
	}
	if output, ok := data["output"].(map[string]any); ok && result == "" {
		result = firstString(output, "video_url", "url")
	}
	state := "IN_PROGRESS"
	reason := ""
	if done || result != "" {
		state = "SUCCESS"
		progress = "100%"
	}
	if isFailure(raw) || raw == "FAILED" {
		state = "FAILURE"
		progress = "0%"
		reason = firstString(task, "fail_reason", "message")
		if reason == "" {
			reason = firstString(data, "fail_reason", "message")
		}
		if reason == "" {
			reason = "视频生成失败"
		}
		result = ""
	}
	return pollParsed{status: state, result: result, reason: reason, progress: progress}
}

func firstString(data map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := data[key].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func uniqueStrings(items []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}
