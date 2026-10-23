package generate

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

func submitVideo(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	model := videoRequestedModel(payload)
	base, apiKey := videoCredentials(cfg, r, payload)
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	adapted := buildVideoPayload(model, prompt, payload)
	protocol := r.Header.Get("x-custom-protocol")
	if adapted.family == "wan" {
		adapted.endpoints, adapted.queries = routeWanEndpoints(base, protocol)
		if err := prepareWanMedia(r.Context(), adapted.payload, workspaceOf(r), cfg.Production()); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "retryable": false, "error": err.Error()})
			return
		}
	}
	key, err := videoSubmissionKey(r, payload)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "retryable": false, "error": err.Error()})
		return
	}
	claim, err := claimVideoSubmission(cfg, r, payload, adapted, base, key)
	if err != nil {
		// This happens before any upstream request. A database failure must stay
		// retryable instead of looking like an unknown paid submission.
		body := map[string]any{"success": false, "taskKey": key, "submitted": false, "submissionUnknown": false, "submissionOutcome": "rejected", "submissionRejected": true, "retryable": true, "error": "视频任务保存失败，尚未向上游提交，可以重试"}
		status := http.StatusBadRequest
		if err == errVideoSubmissionConflict {
			status = http.StatusConflict
			body["submitted"] = false
			body["submissionUnknown"] = false
			body["submissionOutcome"] = "rejected"
			body["submissionRejected"] = true
			body["retryable"] = false
			body["idempotencyConflict"] = true
			body["error"] = err.Error()
		}
		httpx.WriteJSON(w, status, body)
		return
	}
	if !claim.claimed {
		writeVideoSubmission(w, claim, true)
		return
	}
	if apiKey == "" {
		message := "未配置视频生成接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入凭证。"
		_ = settleVideoSubmission(cfg, r, claim.recordID, imageTaskDraft{Status: "FAILURE", FailReason: message})
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "taskKey": key, "recordId": claim.recordID, "submissionOutcome": "rejected", "submissionRejected": true, "error": message, "missingConfig": "apiKey", "retryable": false})
		return
	}
	encoded, _ := json.Marshal(adapted.payload)
	started := time.Now()
	result := gateway.SubmitVideo(r.Context(), gateway.SubmitCommand{
		Endpoints: expandVideoURLs(base, adapted.endpoints, ""), APIKey: apiKey, PayloadJSON: string(encoded), Headers: adapted.headers,
		ReadTaskID:          func(data map[string]any) string { return readVideoTaskID(data, adapted.family) },
		Client:              ModelHTTP(),
		RetryOnMissingInput: adapted.family == "wan",
	})
	if result.Outcome != gateway.Accepted {
		unknown := result.Outcome == gateway.Unknown
		status := http.StatusBadRequest
		message := result.Error
		if message == "" {
			message = "视频提交被拒绝"
		}
		if unknown {
			status = http.StatusServiceUnavailable
			message = "视频提交结果不确定，请核对上游任务记录：" + message
		}
		message = safeVideoSubmitReason(message, apiKey, result.UpstreamStatus, result.EndpointAttempts)
		state := "FAILURE"
		if unknown {
			state = "SUBMISSION_UNKNOWN"
		}
		_ = settleVideoSubmission(cfg, r, claim.recordID, imageTaskDraft{TaskID: result.TaskID, Status: state, FailReason: message})
		body := map[string]any{"success": false, "taskKey": key, "recordId": claim.recordID, "submissionOutcome": string(result.Outcome), "submissionUnknown": unknown, "submissionRejected": !unknown, "retryable": false, "error": message}
		if unknown && result.TaskID != "" {
			body["taskId"] = result.TaskID
		}
		httpx.WriteJSON(w, status, body)
		return
	}
	recordID := claim.recordID
	err = persistVideoTask(cfg, r, adapted, recordID, result.TaskID, prompt)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "taskKey": key, "recordId": recordID, "error": "任务已提交，但本地记录保存失败，请核对原任务", "taskId": result.TaskID,
			"submissionOutcome": "accepted", "submissionUnknown": true, "retryable": false,
		})
		return
	}
	queryIndex := result.EndpointAttempts - 1
	if queryIndex >= 0 && queryIndex < len(adapted.queries) {
		expanded := expandVideoURLs(base, adapted.queries[queryIndex:queryIndex+1], "{taskId}")
		if len(expanded) > 0 {
			rememberVideoQuery(base, result.TaskID, expanded[0])
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"success": true, "taskKey": key, "submissionOutcome": "accepted", "retryable": false, "taskId": result.TaskID, "recordId": recordID, "model": adapted.modelID, "family": adapted.family,
		"duration": adapted.duration, "aspect_ratio": adapted.ratio, "resolution": adapted.resolution, "size": adapted.size,
		"status": "IN_PROGRESS", "prompt": prompt,
		"timing": map[string]any{"parseMs": 0, "convertMs": 0, "gatewayMs": int(time.Since(started).Milliseconds()), "dbMs": 0, "totalMs": int(time.Since(started).Milliseconds()), "payloadKB": len(encoded) / 1024, "imageCount": len(adapted.images), "endpointAttempts": result.EndpointAttempts, "convertCacheHits": 0},
	})
}

type videoAdapted struct {
	family, modelID, ratio, resolution, size string
	duration                                 int
	images                                   []string
	payload                                  map[string]any
	endpoints, queries                       []string
	headers                                  map[string]string
}

func buildVideoPayload(model, prompt string, payload map[string]json.RawMessage) videoAdapted {
	family := videoFamily(model)
	ratio := rawString(payload, "aspect_ratio")
	if ratio == "" {
		ratio = "16:9"
	}
	resolution := strings.ToLower(rawString(payload, "resolution"))
	if resolution == "" {
		resolution = strings.ToLower(defaultVideoResolution(model))
	}
	duration := int(rawNumber(payload, "duration"))
	if duration == 0 {
		duration = 5
	}
	images := videoFrameList(payload)
	videos := rawStringList(payload["videos"])
	mode := resolveVideoMode(model, videoRefMode(payload), len(images), len(videos))
	if family == "grok-video" && mode == "extend" && payload["duration"] == nil {
		duration = 6
	}
	audio, audioSet := rawBoolPresent(payload, "audio")
	watermark := rawBool(payload, "watermark")
	var body map[string]any
	switch family {
	case "vidu":
		body = viduOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, audio, audioSet)
		resolution = viduResolution(resolution)
	case "grok-video":
		body = grokOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, videos)
		resolution = grokResolution(resolution)
	case "wan":
		body = wanOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
		resolution = wanResolution(resolution)
	case "seedance":
		body = seedanceOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	case "kling":
		body = klingOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, audio, audioSet, watermark)
	case "minimax":
		body = minimaxOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, audio, audioSet, watermark)
	default:
		body = flatVideoPayload(model, prompt, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	}
	endpoints, queries, headers := videoEndpoints(family, model, mode, images)
	return videoAdapted{family: family, modelID: model, ratio: ratio, resolution: resolution, size: videoPixelSize(ratio, resolution), duration: duration, images: images, payload: body, endpoints: endpoints, queries: queries, headers: headers}
}

func rawBoolPresent(payload map[string]json.RawMessage, key string) (bool, bool) {
	raw, ok := payload[key]
	if !ok {
		return false, false
	}
	var value bool
	if json.Unmarshal(raw, &value) != nil {
		return false, false
	}
	return value, true
}

func videoFamily(model string) string {
	id := strings.ToLower(model)
	switch {
	case strings.Contains(id, "seedance"):
		return "seedance"
	case strings.Contains(id, "veo") || strings.Contains(id, "omni_flash") || strings.Contains(id, "omni-flash"):
		return "veo"
	case strings.Contains(id, "wan"):
		return "wan"
	case strings.Contains(id, "minimax") || strings.Contains(id, "hailuo"):
		return "minimax"
	case strings.Contains(id, "sora"):
		return "sora"
	case strings.Contains(id, "kling"):
		return "kling"
	case strings.Contains(id, "vidu"):
		return "vidu"
	case strings.Contains(id, "grok"):
		return "grok-video"
	default:
		return "video"
	}
}

func videoEndpoints(family, model, mode string, images []string) ([]string, []string, map[string]string) {
	return videoEndpointSet(family, model, mode, images)
}

func videoPixelSize(ratio, resolution string) string {
	switch ratio {
	case "9:16":
		return "720x1280"
	case "1:1":
		return "1024x1024"
	case "3:4":
		return "720x960"
	case "4:3":
		return "960x720"
	default:
		if strings.Contains(strings.ToLower(resolution), "1080") {
			return "1920x1080"
		}
		return "1280x720"
	}
}

func rawNumber(payload map[string]json.RawMessage, key string) float64 {
	var value float64
	if json.Unmarshal(payload[key], &value) != nil {
		return 0
	}
	return value
}

func readVideoTaskID(data map[string]any, family string) string {
	if data == nil || data["error"] != nil {
		return ""
	}
	if text, ok := data["task_id"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	if nested, ok := data["data"].(map[string]any); ok {
		if text, ok := nested["task_id"].(string); ok && text != "" {
			return text
		}
	}
	if output, ok := data["output"].(map[string]any); ok {
		if text, ok := output["task_id"].(string); ok && text != "" {
			return text
		}
	}
	if text, ok := data["id"].(string); ok && text != "" {
		return text
	}
	if text, ok := data["data"].(string); ok && text != "" {
		return text
	}
	if family == "grok-video" {
		if text, ok := data["request_id"].(string); ok {
			return text
		}
	}
	return ""
}

func videoCredentials(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (string, string) {
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := ImageDefaultBase()
	if clientBase != "" {
		base = system.NormalizeGatewayBaseURL(clientBase)
	}
	return base, imageAPIKey(cfg, r, payload, clientBase)
}

func persistVideoTask(cfg config.Config, r *http.Request, adapted videoAdapted, recordID, taskID, prompt string) error {
	return settleVideoSubmission(cfg, r, recordID, imageTaskDraft{
		Prompt: prompt, TaskID: taskID, Model: adapted.modelID,
		Size: adapted.ratio, Quality: adapted.resolution, Status: "IN_PROGRESS", MediaType: "video",
	})
}
