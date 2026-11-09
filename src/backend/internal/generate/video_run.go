package generate

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

func submitVideo(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	model := videoRequestedModel(payload)
	base, apiKey := videoCredentials(cfg, r, payload)
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	if rawBool(payload, "preserve_prompt") {
		_ = json.Unmarshal(payload["prompt"], &prompt)
	}
	adapted := buildVideoPayload(model, prompt, payload)
	applyMinimaxH3Channel(base, payload, &adapted)
	if adapted.family == "grok-video" {
		mode := resolveVideoMode(model, videoRefMode(payload), len(adapted.images), len(rawStringList(payload["videos"])))
		adapted.endpoints, adapted.queries = routeGrokEndpoints(base, mode)
	}
	protocol := r.Header.Get("x-custom-protocol")
	if adapted.family == "wan" {
		adapted.endpoints, adapted.queries = routeWanEndpoints(base, protocol)
	}
	applyNativeVideoRoute(base, resolveVideoMode(model, videoRefMode(payload), len(adapted.images), len(rawStringList(payload["videos"]))), apiKey, &adapted)
	if err := applyVeoNativeRoute(base, payload, &adapted); err != nil {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
		return
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
		claim.diagnostics = readVideoSubmissionDiagnostics(cfg, workspaceOf(r), claim.recordID)
		writeVideoSubmission(w, claim, true)
		return
	}
	if apiKey == "" {
		message := "未配置视频生成接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入凭证。"
		_ = settleVideoSubmission(cfg, r, claim.recordID, imageTaskDraft{Status: "FAILURE", FailReason: message})
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "taskKey": key, "recordId": claim.recordID, "submissionOutcome": "rejected", "submissionRejected": true, "error": message, "missingConfig": "apiKey", "retryable": false})
		return
	}
	// Claim the original references before uploading: object keys and signed URLs
	// change per upload and must not alter a request's idempotency fingerprint.
	var form *gateway.VideoForm
	preparedAudios, audioPreparation, prepareErr := prepareVideoAudioReferences(r.Context(), cfg.Root, model, rawStringList(payload["audios"]), workspaceOf(r), cfg.Production(), resolveVideoStorageConfig(r, payload))
	if prepareErr == nil {
		adapted.audioPreparation = audioPreparation
		replaceVideoAudioReferences(adapted.payload, adapted.family, preparedAudios)
		switch adapted.family {
		case "veo":
			if veoNativeBase(base) {
				prepareErr = prepareVeoNativeMedia(r.Context(), cfg, adapted.payload, workspaceOf(r))
			} else if rawString(payload, "ref_mode") == "extend" {
				prepareErr = prepareVeoExtension(r.Context(), cfg, workspaceOf(r), claim.recordID, payload, &adapted)
			}
		case "omni-flash":
			form, prepareErr = prepareOmniForm(r.Context(), adapted, rawStringList(payload["videos"]), workspaceOf(r), cfg.Production())
		case "grok-video":
			prepareErr = prepareGrokMedia(r.Context(), adapted.payload, workspaceOf(r), cfg.Production())
		case "minimax":
			if minimaxH3(model) {
				prepareErr = prepareMinimaxH3Media(r.Context(), cfg.Root, adapted.payload, workspaceOf(r), cfg.Production(), resolveVideoStorageConfig(r, payload))
			}
		case "vidu":
			prepareErr = prepareViduAudioReferences(r.Context(), cfg.Root, adapted.payload, workspaceOf(r), cfg.Production(), resolveVideoStorageConfig(r, payload))
			if prepareErr == nil {
				prepareErr = prepareViduImageReferences(r.Context(), adapted.payload, workspaceOf(r), cfg.Production())
			}
		case "wan":
			prepareErr = prepareWanMedia(r.Context(), cfg.Root, adapted.payload, workspaceOf(r), cfg.Production(), resolveVideoStorageConfig(r, payload))
		case "seedance":
			prepareErr = prepareSeedanceMedia(r.Context(), cfg.Root, base, apiKey, adapted.payload, workspaceOf(r), cfg.Production(), r, payload)
		case "kling":
			prepareErr = prepareKlingMedia(r.Context(), cfg.Root, adapted.payload, workspaceOf(r), cfg.Production(), resolveVideoStorageConfig(r, payload))
		}
	}
	if prepareErr != nil {
		message := prepareErr.Error()
		_ = settleVideoSubmission(cfg, r, claim.recordID, imageTaskDraft{Status: "FAILURE", FailReason: message})
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "taskKey": key, "recordId": claim.recordID, "submissionOutcome": "rejected", "submissionRejected": true, "retryable": false, "error": message})
		return
	}
	applyKlingMotionChannel(base, &adapted)
	applyVeoComflyChannel(base, payload, &adapted)
	var nativeH3 map[string]any
	var multipartFields map[string][]string
	if minimaxH3(model) {
		nativeH3 = adapted.payload
		multipartFields = routeMinimaxH3Submission(base, &adapted)
	}
	mode := resolveVideoMode(model, videoRefMode(payload), len(adapted.images), len(rawStringList(payload["videos"])))
	alternateBodies := videoAlternateBodies(base, &adapted, mode, nativeH3)
	diagnostic, diagnosticErr := prepareVideoSubmissionDiagnostics(cfg, r, claim.recordID, payload, adapted)
	if diagnosticErr != nil {
		rejectVideoDiagnosticPreparation(cfg, w, r, claim.recordID, key)
		return
	}
	encoded, _ := json.Marshal(adapted.payload)
	started := time.Now()
	result := gateway.SubmitVideo(r.Context(), gateway.SubmitCommand{
		Endpoints: expandVideoURLs(base, adapted.endpoints, ""), APIKey: apiKey, PayloadJSON: string(encoded), EndpointBodies: alternateBodies, MultipartFields: multipartFields, Form: form, Headers: adapted.headers,
		ReadTaskID:          func(data map[string]any) string { return readVideoTaskID(data, adapted.family) },
		Client:              gateway.ModelHTTP(),
		RetryOnMissingInput: adapted.family == "wan",
	})
	if usage := gateway.NormalizeUsage(result.Data); usage != nil {
		rememberTaskUsage(r.Context(), cfg, taskScope{workspace: workspaceOf(r), media: "video", recordID: claim.recordID}, claim.taskID, usage)
	}
	diagnosticSaved := finishVideoSubmissionDiagnostics(cfg, r, claim.recordID, diagnostic, result, apiKey)
	queryTemplate := ""
	queryIndex := -1
	for index, endpoint := range expandVideoURLs(base, adapted.endpoints, "") {
		if endpoint == result.UsedSubmitURL {
			queryIndex = index
			break
		}
	}
	if queryIndex >= 0 && queryIndex < len(adapted.queries) {
		expanded := expandVideoURLs(base, adapted.queries[queryIndex:queryIndex+1], "{taskId}")
		if len(expanded) > 0 {
			queryTemplate = expanded[0]
		}
	}
	route := videoSubmissionRoute(cfg, r, payload, adapted.modelID, queryTemplate)
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
		_ = settleVideoSubmission(cfg, r, claim.recordID, imageTaskDraft{TaskID: result.TaskID, Status: state, FailReason: message, RouteFingerprint: route})
		body := map[string]any{"success": false, "taskKey": key, "recordId": claim.recordID, "submissionOutcome": string(result.Outcome), "submissionUnknown": unknown, "submissionRejected": !unknown, "retryable": false, "error": message}
		attachUsage(body, result.Data)
		body["submissionDiagnostics"], body["diagnosticsSaved"] = diagnostic, diagnosticSaved
		if unknown && result.TaskID != "" {
			body["taskId"] = result.TaskID
		}
		httpx.WriteJSON(w, status, body)
		return
	}
	recordID := claim.recordID
	created := pollParsed{status: "IN_PROGRESS"}
	if (adapted.family == "omni-flash" || minimaxH3(model)) && videoPollReady(result.Data) {
		created = readVideoPoll(result.Data)
	}
	err = persistVideoTask(cfg, r, adapted, recordID, result.TaskID, prompt, created, route)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "taskKey": key, "recordId": recordID, "error": "任务已提交，但本地记录保存失败，请核对原任务", "taskId": result.TaskID,
			"submissionOutcome": "accepted", "submissionUnknown": true, "retryable": false,
			"submissionDiagnostics": diagnostic, "diagnosticsSaved": diagnosticSaved,
		})
		return
	}
	if queryTemplate != "" {
		rememberVideoQuery(base, result.TaskID, queryTemplate)
	}
	body := map[string]any{
		"success": true, "taskKey": key, "submissionOutcome": "accepted", "retryable": false, "taskId": result.TaskID, "recordId": recordID, "model": adapted.modelID, "family": adapted.family,
		"duration": adapted.duration, "aspect_ratio": adapted.ratio, "resolution": adapted.resolution, "size": adapted.size,
		"status": created.status, "resultUrl": created.result, "failReason": created.reason, "progress": created.progress, "prompt": prompt,
		"submissionDiagnostics": diagnostic, "diagnosticsSaved": diagnosticSaved,
		"timing": map[string]any{"parseMs": 0, "convertMs": 0, "gatewayMs": int(time.Since(started).Milliseconds()), "dbMs": 0, "totalMs": int(time.Since(started).Milliseconds()), "payloadKB": len(encoded) / 1024, "imageCount": len(adapted.images), "endpointAttempts": result.EndpointAttempts, "convertCacheHits": 0},
	}
	attachUsage(body, result.Data)
	httpx.WriteJSON(w, http.StatusOK, body)
}

type videoAdapted struct {
	family, modelID, ratio, resolution, size string
	duration                                 int
	images                                   []string
	audioPreparation                         []videoAudioPreparation
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
	case "omni-flash":
		model = "omni_flash-10s"
		duration = 10
		body = map[string]any{"model": model, "prompt": omniFlashRolePrompt(prompt, mode, len(images), len(videos)), "size": videoPixelSize(ratio, "720P")}
		if len(images) > 0 {
			body["images"] = images
		}
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
		attachKlingVideos(body, mode, videos, audio, audioSet)
		if mode == "motion_control" {
			body = klingMotionPayload(prompt, resolution, images, videos, audio, audioSet, watermark)
		}
	case "minimax":
		body = minimaxOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	case "veo":
		body = veoOfficialPayload(model, prompt, mode, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	default:
		body = flatVideoPayload(model, prompt, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	}
	attachVideoAudioReferences(body, family, rawStringList(payload["audios"]))
	attachVideoSeed(body, family, payload)
	if family == "grok-video" {
		attachGrokVoiceReferences(body, rawStringList(payload["voice_ids"]))
	}
	// Managed workflows opt out of adapter-written text and upstream prompt rewriting.
	// This flag is local transport policy and is never forwarded to the provider.
	if rawBool(payload, "preserve_prompt") {
		switch family {
		case "vidu":
			if viduQ4Preview(model) && mode == "first_frame" {
				body["is_rec"] = false
			}
		case "minimax":
			if minimaxH3(model) {
				body["content"].([]map[string]any)[0]["text"] = prompt
			} else {
				body["prompt"] = prompt
			}
		case "wan":
			body["parameters"].(map[string]any)["prompt_extend"] = false
		case "seedance":
			content, _ := body["content"].([]map[string]any)
			if len(content) > 0 && content[0]["type"] == "text" {
				content[0]["text"] = prompt
			}
		}
	}
	endpoints, queries, headers := videoEndpoints(family, model, mode, images)
	return videoAdapted{family: family, modelID: model, ratio: ratio, resolution: resolution, size: videoPixelSize(ratio, resolution), duration: duration, images: images, payload: body, endpoints: endpoints, queries: queries, headers: headers}
}

func videoFamily(model string) string {
	id := strings.ToLower(model)
	switch {
	case strings.Contains(id, "seedance"):
		return "seedance"
	case omniFlash(model):
		return "omni-flash"
	case strings.Contains(id, "veo"):
		return "veo"
	case strings.Contains(id, "wan"):
		return "wan"
	case strings.Contains(id, "minimax") || strings.Contains(id, "hailuo") || id == "h3":
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

func veoOfficialPayload(model, prompt, mode, ratio, resolution string, duration int, images, videos []string, audio, audioSet, watermark bool) map[string]any {
	body := flatVideoPayload(model, prompt, ratio, resolution, duration, images, videos, audio, audioSet, watermark)
	body["enable_upsample"] = true
	switch mode {
	case "first_frame":
		if len(images) > 0 {
			body["first_frame_image"] = images[0]
			body["images"] = []string{images[0]}
		}
	case "first_last_frame":
		if len(images) >= 2 {
			first, last := images[0], images[len(images)-1]
			body["first_frame_image"] = first
			body["last_frame_image"] = last
			body["end_frame_image"] = last
			body["image_tail"] = last
			body["images"] = []string{first, last}
		}
	case "omni", "edit", "extend":
		if len(images) > 0 {
			body["reference_images"] = images
		}
		delete(body, "image")
		if !strings.Contains(strings.ToLower(model), "omni") {
			delete(body, "images")
		}
	}
	return body
}

func videoCredentials(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (string, string) {
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	base := ImageDefaultBase()
	if clientBase != "" {
		base = gateway.NormalizeGatewayBaseURL(clientBase)
	}
	return base, imageAPIKey(cfg, r, payload, clientBase)
}

func persistVideoTask(cfg config.Config, r *http.Request, adapted videoAdapted, recordID, taskID, prompt string, created pollParsed, route string) error {
	return settleVideoSubmission(cfg, r, recordID, imageTaskDraft{
		Prompt: prompt, TaskID: taskID, Model: adapted.modelID,
		Size: adapted.ratio, Quality: adapted.resolution, Status: created.status, ResultURL: created.result, FailReason: created.reason, MediaType: "video", RouteFingerprint: route,
	})
}
