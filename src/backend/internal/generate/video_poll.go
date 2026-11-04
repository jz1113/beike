package generate

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func pollVideoTask(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) {
	if !authorizeTaskPoll(cfg, w, r, "video", taskID) {
		return
	}
	if body, status, ok := savedTerminal(cfg, r, "video", taskID, "视频任务失败"); ok {
		httpx.WriteJSON(w, status, body)
		return
	}
	base, apiKey := pollCredentials(cfg, r)
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	urls := videoPollURLs(root, taskID, r.URL.Query().Get("model"), r.Header.Get("x-custom-protocol"))
	for _, endpoint := range urls {
		status, raw, err := gateway.PostModel(r.Context(), http.MethodGet, endpoint, apiKey, nil, 5*time.Second)
		if err != nil || status < 200 || status >= 300 {
			continue
		}
		var data map[string]any
		if json.Unmarshal(raw, &data) != nil || !videoPollReady(data) {
			continue
		}
		parsed := readVideoPoll(data)
		settleUnknownVideoTerminal(cfg, r, taskID, parsed, gateway.EncodeUsage(gateway.NormalizeUsage(data)))
		httpx.WriteJSON(w, http.StatusOK, polledTaskBody(r.Context(), cfg, scopeOf(r, "video"), taskID, parsed, data))
		return
	}
	writeProbeMiss(cfg, w, r, "video", taskID, "视频任务失败", "暂时无法查询云端视频任务状态")
}

func videoPollURLs(base, taskID, model, protocol string) []string {
	var urls []string
	if template := videoQueryTemplate(base, taskID); template != "" && !(minimaxH3(model) && minimaxMetasoHost(base)) {
		urls = append(urls, strings.ReplaceAll(template, "{taskId}", url.QueryEscape(taskID)))
	}
	var queries []string
	if minimaxH3(model) {
		_, queries = minimaxH3Route(base)
	} else if videoFamily(model) == "wan" {
		_, queries = routeWanEndpoints(base, protocol)
	} else if videoFamily(model) == "grok-video" {
		_, queries = routeGrokEndpoints(base, "")
	} else {
		_, queries, _ = videoEndpointSet(videoFamily(model), model, "", nil)
	}
	urls = append(urls, expandVideoURLs(base, queries, url.QueryEscape(taskID))...)
	if (model == "wan3.0-video" || model == "wan3.0-video-prime") && minimaxComflyHost(base) {
		urls = append(urls, base+"/v1/videos/"+url.PathEscape(taskID))
	}
	if omniFlash(model) {
		return uniqueStrings(urls)
	}
	if videoFamily(model) != "wan" && !(videoFamily(model) == "grok-video" && grokOfficialHost(base)) && !(minimaxH3(model) && (minimaxOfficialHost(base) || minimaxComflyHost(base) || minimaxMetasoHost(base))) {
		urls = append(urls, base+"/v1/videos/"+taskID, base+"/v2/videos/generations/"+taskID, base+"/seedance/v3/contents/generations/tasks/"+taskID)
	}
	return uniqueStrings(urls)
}

func videoErrorMessage(data map[string]any) string {
	switch err := data["error"].(type) {
	case string:
		return gateway.PresentUpstreamError(err)
	case map[string]any:
		return gateway.PresentUpstreamError(firstString(err, "message"))
	default:
		return ""
	}
}

func videoPollReady(data map[string]any) bool {
	task := videoPollTaskData(data)
	// A query error alone says nothing about the original generation task.
	return firstString(task, "task_status", "status", "state") != "" ||
		firstString(data, "task_status", "status", "state") != "" || extractVideoResult(data, task) != ""
}

func videoPollTaskData(data map[string]any) map[string]any {
	for _, key := range []string{"task", "data", "output"} {
		if nested, ok := data[key].(map[string]any); ok {
			return nested
		}
	}
	return data
}

func readVideoPoll(data map[string]any) pollParsed {
	task := videoPollTaskData(data)
	raw := strings.ToUpper(firstString(task, "task_status", "status", "state"))
	if raw == "" {
		raw = strings.ToUpper(firstString(data, "task_status", "status", "state"))
	}
	done := raw == "SUCCESS" || raw == "SUCCEEDED" || raw == "COMPLETED" || raw == "FINISHED" || raw == "DONE" || raw == "SUCCEED"
	progress := progressText(task)
	if progress == "" {
		progress = progressText(data)
	}
	if done {
		progress = "100%"
	}
	result := extractVideoResult(data, task)
	state := "IN_PROGRESS"
	reason := ""
	if isFailure(raw) || raw == "FAILED" {
		state = "FAILURE"
		progress = "0%"
		reason = firstString(task, "fail_reason", "message")
		if reason == "" {
			reason = firstString(data, "fail_reason", "message")
		}
		if reason == "" {
			reason = firstString(task, "err_code")
		}
		if reason == "" {
			reason = videoErrorMessage(task)
		}
		if reason == "" {
			reason = videoErrorMessage(data)
		}
		if reason == "" {
			reason = "视频生成失败"
		}
		reason = gateway.PresentVideoError(reason)
		result = ""
	} else if isOngoing(raw) {
		result = ""
	} else if result != "" {
		state = "SUCCESS"
		progress = "100%"
	} else if done {
		progress = "90%"
		reason = "成片地址尚未返回"
	}
	return pollParsed{status: state, result: result, reason: reason, progress: progress}
}

func extractVideoResult(roots ...map[string]any) string {
	for _, root := range roots {
		if root == nil {
			continue
		}
		if url := firstString(root, "video_url", "url"); url != "" {
			return url
		}
		if video, ok := root["video"].(map[string]any); ok {
			if url := firstString(video, "url", "video_url"); url != "" {
				return url
			}
		}
		if content, ok := root["content"].(map[string]any); ok {
			if url := firstString(content, "video_url", "url"); url != "" {
				return url
			}
		}
		if output, ok := root["output"].(map[string]any); ok {
			if url := firstString(output, "video_url", "url"); url != "" {
				return url
			}
		}
		if url := firstMediaURL(root["creations"]); url != "" {
			return url
		}
		if url := firstMediaURL(root["videos"]); url != "" {
			return url
		}
		if result, ok := root["task_result"].(map[string]any); ok {
			if url := firstMediaURL(result["videos"]); url != "" {
				return url
			}
			if url := firstString(result, "video_url", "url"); url != "" {
				return url
			}
		}
	}
	return ""
}

func firstMediaURL(value any) string {
	switch items := value.(type) {
	case []any:
		for _, item := range items {
			obj, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if url := firstString(obj, "video_url", "url"); url != "" {
				return url
			}
		}
	case map[string]any:
		return firstString(items, "video_url", "url")
	}
	return ""
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
