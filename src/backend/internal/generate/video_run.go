package generate

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/modelgw"
	"beike.local/cloud/src/backend/internal/system"
)

func submitVideo(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	model := videoRequestedModel(payload)
	base, apiKey := videoCredentials(cfg, r, payload)
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	adapted := buildVideoPayload(model, prompt, payload)
	key, err := videoSubmissionKey(r, payload)
	if err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "retryable": false, "error": err.Error()})
		return
	}
	claim, err := claimVideoSubmission(cfg, r, payload, adapted, base, key)
	if err != nil {
		body := map[string]any{"success": false, "taskKey": key, "submissionUnknown": true, "submissionOutcome": "unknown", "retryable": false, "error": "原视频提交回执暂时无法核对，未重发上游请求"}
		status := http.StatusServiceUnavailable
		if err == errVideoSubmissionConflict {
			status = http.StatusConflict
			body["submissionUnknown"] = false
			body["submissionOutcome"] = "rejected"
			body["submissionRejected"] = true
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
	result := modelgw.SubmitVideo(r.Context(), modelgw.SubmitCommand{
		Endpoints: expandVideoURLs(base, adapted.endpoints, ""), APIKey: apiKey, PayloadJSON: string(encoded), Headers: adapted.headers,
		ReadTaskID: func(data map[string]any) string { return readVideoTaskID(data, adapted.family) },
		Client:     ModelHTTP(),
	})
	if result.Outcome != modelgw.Accepted {
		unknown := result.Outcome == modelgw.Unknown
		status := http.StatusBadRequest
		message := result.Error
		if message == "" {
			message = "视频提交被拒绝"
		}
		if unknown {
			status = http.StatusServiceUnavailable
			message = "视频提交结果不确定，请核对上游任务记录"
		}
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
	if len(adapted.queries) > 0 {
		expanded := expandVideoURLs(base, adapted.queries[:1], "{taskId}")
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
	var body map[string]any
	switch family {
	case "vidu":
		body = viduOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, audio, audioSet)
		resolution = viduResolution(resolution)
	case "grok-video":
		body = grokOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, videos)
		resolution = grokResolution(resolution)
	default:
		body = map[string]any{
			"model": model, "prompt": prompt, "duration": duration, "ratio": ratio, "aspect_ratio": ratio,
			"resolution": resolution, "watermark": rawBool(payload, "watermark"), "size": videoPixelSize(ratio, resolution),
		}
		if audioSet && audio {
			body["audio"] = true
			body["generate_audio"] = true
		}
		if len(images) > 0 {
			body["images"] = images
			body["image"] = images[0]
		}
		if len(videos) > 0 {
			body["videos"] = videos
		}
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

func viduResolution(resolution string) string {
	upper := strings.ToUpper(strings.TrimSpace(resolution))
	switch {
	case strings.Contains(upper, "540"):
		return "540p"
	case strings.Contains(upper, "1080"):
		return "1080p"
	case strings.Contains(upper, "720"):
		return "720p"
	case strings.Contains(upper, "4K"):
		return "4K"
	case strings.Contains(upper, "2K"):
		return "2K"
	default:
		return "720p"
	}
}

func grokResolution(resolution string) string {
	upper := strings.ToUpper(strings.TrimSpace(resolution))
	switch {
	case strings.Contains(upper, "1080"):
		return "1080p"
	case strings.Contains(upper, "720"):
		return "720p"
	default:
		return "480p"
	}
}

func viduOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images []string, audio, audioSet bool) map[string]any {
	body := map[string]any{
		"model": model, "prompt": prompt, "duration": duration, "resolution": viduResolution(resolution),
	}
	if audioSet {
		body["audio"] = audio
	}
	switch mode {
	case "first_frame":
		if len(images) > 0 {
			body["images"] = []string{images[0]}
		}
	case "first_last_frame":
		if len(images) >= 2 {
			body["images"] = []string{images[0], images[len(images)-1]}
		}
	case "text":
		body["aspect_ratio"] = ratio
	default:
		body["images"] = images
		body["aspect_ratio"] = ratio
	}
	return body
}

func grokOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string) map[string]any {
	if mode == "edit" || mode == "extend" {
		body := map[string]any{"model": model, "prompt": prompt}
		if len(videos) > 0 {
			body["video"] = map[string]string{"url": videos[0]}
		}
		if mode == "extend" {
			if duration == 0 {
				duration = 6
			}
			body["duration"] = duration
		}
		return body
	}
	body := map[string]any{
		"model": model, "prompt": prompt, "duration": duration,
		"aspect_ratio": ratio, "resolution": grokResolution(resolution),
	}
	switch mode {
	case "first_frame":
		if len(images) > 0 {
			body["image"] = map[string]string{"url": images[0]}
		}
	case "first_last_frame":
		if len(images) > 0 {
			body["image"] = map[string]string{"url": images[0]}
		}
		if len(images) > 1 {
			body["last_frame"] = map[string]string{"url": images[len(images)-1]}
		}
	case "omni":
		refs := make([]map[string]string, 0, len(images))
		for _, item := range images {
			refs = append(refs, map[string]string{"url": item})
		}
		if len(refs) > 0 {
			body["reference_images"] = refs
		}
	}
	return body
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
