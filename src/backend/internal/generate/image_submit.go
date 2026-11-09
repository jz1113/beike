package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

func Image(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			imagePoll(cfg, w, r)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			if len(body) >= 8_000_000 {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "参考图体积过大，请求在传输中被截断。请压缩垫图后重试，或减少同时传入的参考图数量。"})
				return
			}
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		if status, fields := imagePayloadError(cfg, r, payload); status != 0 {
			httpx.WriteJSON(w, status, fields)
			return
		}
		submitImage(cfg, w, r, payload)
	})
}

func imagePoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("taskId") == "" && query.Has("taskKey") {
		key := query.Get("taskKey")
		if strings.TrimSpace(key) == "" || len(key) > 256 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
			return
		}
		row, err := lookupImageTaskByKey(cfg, r, key)
		if err == nil && !row.found && query.Get("closeMissing") == "true" {
			row, err = closeMissingImageSubmission(cfg, r, key)
		}
		if err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "submissionUnknown": true, "retryable": true, "error": "原任务提交记录暂时无法核对，请稍后查询"})
			return
		}
		if !row.found {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "QUERY_FAILED", "retryable": true, "error": "尚未找到原任务记录，请稍后核对；不会自动重新提交"})
			return
		}
		r.Header.Set("x-task-record-id", row.recordID)
		if row.status == "SUBMISSION_UNKNOWN" {
			body := map[string]any{"success": false, "status": "QUERY_FAILED", "submissionUnknown": true, "retryable": false, "error": row.reason}
			body["recordId"] = row.recordID
			putStoredUsage(body, row.usage)
			if !imageTaskStillSubmitting(row.taskID) {
				body["taskId"] = row.taskID
			}
			httpx.WriteJSON(w, http.StatusOK, body)
			return
		}
		if strings.EqualFold(row.status, "FAILURE") {
			reason := row.reason
			if reason == "" {
				reason = "生图任务失败"
			}
			body := map[string]any{
				"recordId": row.recordID,
				"success":  true, "status": "FAILURE", "progress": "0%", "resultUrl": "", "failReason": reason,
				"submissionRejected": strings.HasPrefix(row.recordID, "closed_"),
			}
			if !imageTaskStillSubmitting(row.taskID) {
				body["taskId"] = row.taskID
			}
			putStoredUsage(body, row.usage)
			httpx.WriteJSON(w, http.StatusOK, body)
			return
		}
		if imageTaskStillSubmitting(row.taskID) {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"success": true, "status": "IN_PROGRESS", "progress": "15%", "retryable": true, "submissionPending": true,
			})
			return
		}
		if strings.HasPrefix(row.taskID, "direct_") {
			writeDirectImagePoll(cfg, w, r, row.taskID)
			return
		}
		pollImageTask(cfg, w, r, row.taskID)
		return
	}
	if query.Get("taskId") == "" && !query.Has("taskKey") {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 参数"})
		return
	}
	if taskID := query.Get("taskId"); strings.HasPrefix(taskID, "direct_") {
		writeDirectImagePoll(cfg, w, r, taskID)
		return
	}
	pollImageTask(cfg, w, r, query.Get("taskId"))
}

func jsonString(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", false
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

func jsString(raw json.RawMessage) string {
	if text, ok := jsonString(raw); ok {
		return text
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "null" || trimmed == "" {
		return "null"
	}
	if trimmed == "true" || trimmed == "false" {
		return trimmed
	}
	if number, err := strconv.ParseFloat(trimmed, 64); err == nil {
		return strconv.FormatFloat(number, 'f', -1, 64)
	}
	return trimmed
}

const maxImageBatch = 20

func ImageBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		var envelope struct {
			Items []json.RawMessage `json:"items"`
		}
		if json.Unmarshal(body, &envelope) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请求数据格式异常或体积过大 ()"})
			return
		}
		if len(envelope.Items) < 1 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "至少提交 1 张图片"})
			return
		}
		if len(envelope.Items) > maxImageBatch {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "一批最多提交 20 张图片"})
			return
		}
		results := make([]map[string]any, len(envelope.Items))
		var group sync.WaitGroup
		slots := make(chan struct{}, maxImageBatch)
		for index, raw := range envelope.Items {
			group.Add(1)
			go func(index int, raw json.RawMessage) {
				defer group.Done()
				slots <- struct{}{}
				defer func() { <-slots }()
				results[index] = submitImageBatchItem(cfg, r, raw)
			}(index, raw)
		}
		group.Wait()
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "items": results})
	})
}

func submitImageBatchItem(cfg config.Config, r *http.Request, raw json.RawMessage) map[string]any {
	var payload map[string]json.RawMessage
	if json.Unmarshal(raw, &payload) != nil || payload == nil {
		return map[string]any{"success": false, "error": "单张请求数据格式异常"}
	}
	id := rawString(payload, "id")
	key := rawString(payload, "idempotencyKey")
	if len(key) > 256 {
		return stampImageBatchItem(id, map[string]any{"success": false, "error": "任务标识无效"}, http.StatusBadRequest)
	}
	if status, fields := imagePayloadError(cfg, r, payload); status != 0 {
		return stampImageBatchItem(id, fields, status)
	}
	status, body := executeImageSubmission(cfg, r, payload, key)
	return stampImageBatchItem(id, body, status)
}

func stampImageBatchItem(id string, body map[string]any, status int) map[string]any {
	if body == nil {
		body = map[string]any{"success": false, "error": "生图提交失败"}
	}
	if id != "" {
		body["id"] = id
	}
	body["httpStatus"] = status
	return body
}

func imagePayloadError(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (int, map[string]any) {
	prompt, ok := jsonString(payload["prompt"])
	if !ok || strings.TrimSpace(prompt) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "提示词不能为空"}
	}
	model := "gpt-image-2"
	if raw, exists := payload["model"]; exists {
		model = jsString(raw)
	}
	if strings.TrimSpace(model) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "模型名称不能为空"}
	}
	if status, fields := imageGatewayError(cfg, r, payload, model); status != 0 {
		return status, fields
	}
	if message := workshopProductImageError(payload); message != "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": message}
	}
	if message := imageModelRuleError(payload, model); message != "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": message}
	}
	return 0, nil
}

func comflyJSONEdit(model string) bool {
	switch strings.ToLower(model) {
	case "gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "grok-imagine-image", "grok-imagine-image-quality", "grok-imagine-image-2.0", "grok-4.1-image", "grok-4.2-image":
		return true
	}
	return false
}

func submitUnifiedImageEdit(req imageRequest, a imageAdapted) (imageSubmitResult, error) {
	refs, err := dashscopeImageRefs(req)
	if err != nil {
		return imageSubmitResult{}, err
	}
	a.useEdits = true
	a.endpoint = "edits"
	delete(a.payload, "image")
	switch {
	case req.Model == "gpt-image-2":
		a.payload["images"] = refs
	case req.Model == "grok-imagine-image":
		a.payload["image"] = refs
	case len(refs) == 1:
		a.payload["image"] = refs[0]
	default:
		a.payload["images"] = refs
	}
	if isGptImageModel(req.Model) {
		delete(a.payload, "n")
	}
	endpoint := gateway.NormalizeGatewayBaseURL(req.Base) + "/v1/images/edits"
	status, raw, err := gateway.PostModel(req.context(), http.MethodPost, endpoint, req.APIKey, a.payload, 180*time.Second)
	if err != nil {
		return imageSubmitResult{}, err
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	// Some Comfly channels expose the OpenAI multipart edit endpoint at the same URL.
	// Retry only an explicit form-parser rejection, never an uncertain submission.
	if isGptImageModel(req.Model) && status >= 400 && data["task_id"] == nil && data["id"] == nil &&
		data["data"] == nil && strings.Contains(strings.ToLower(imageUpstreamError(data, status)), "failed to parse multipart form") {
		delete(a.payload, "images")
		a.payload["image"] = req.Refs
		status, raw, err = postImageEdit(req.context(), endpoint+"?async=true", req.APIKey, a.payload, req.Workspace, req.Production, 180*time.Second)
		if err != nil {
			return imageSubmitResult{}, err
		}
		data = map[string]any{}
		_ = json.Unmarshal(raw, &data)
	}
	task, direct := imageOutcome(data)
	return imageSubmitResult{Status: status, Data: data, TaskID: task, Direct: direct, Adapted: a}, nil
}

// The Comfly 2K and 4K Nano Banana 2 channels use tier-specific model IDs.
func comflyGeminiImageModel(base, model, tier string) string {
	if imageHostIs(base, "comfly.org") && (model == "gemini-3.1-flash-image" || model == "gemini-3.1-flash-image-preview" || model == "nano-banana-2") && (tier == "2K" || tier == "4K") {
		return "gemini-3.1-flash-image-preview-" + strings.ToLower(tier)
	}
	return model
}

func OptionalEnum(obj map[string]any, key, choices string, allowed ...string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, isString := value.(string)
	if !isString {
		return "Expected " + choices + ", received " + ZodReceived(value)
	}
	for _, item := range allowed {
		if text == item {
			return ""
		}
	}
	return "Invalid enum value. Expected " + choices + ", received '" + text + "'"
}

func ZodReceived(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64:
		return "number"
	case []any:
		return "array"
	default:
		return "object"
	}
}
