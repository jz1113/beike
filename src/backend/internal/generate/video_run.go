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
	if apiKey == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "未配置视频生成接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入凭证。", "missingConfig": "apiKey", "retryable": false})
		return
	}
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	adapted := buildVideoPayload(model, prompt, payload)
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
		body := map[string]any{"success": false, "submissionOutcome": string(result.Outcome), "submissionUnknown": unknown, "retryable": false, "error": message}
		if unknown && result.TaskID != "" {
			body["taskId"] = result.TaskID
		}
		httpx.WriteJSON(w, status, body)
		return
	}
	recordID, err := persistVideoTask(cfg, r, payload, adapted, result.TaskID, prompt)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "error": "任务已提交，但本地记录保存失败，请核对原任务", "taskId": result.TaskID,
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
		"success": true, "taskId": result.TaskID, "recordId": recordID, "model": adapted.modelID, "family": adapted.family,
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
	images := rawStringList(payload["images"])
	body := map[string]any{
		"model": model, "prompt": prompt, "duration": duration, "ratio": ratio, "aspect_ratio": ratio,
		"resolution": resolution, "watermark": rawBool(payload, "watermark"), "size": videoPixelSize(ratio, resolution),
	}
	if len(images) > 0 {
		body["images"] = images
		body["image"] = images[0]
	}
	if videos := rawStringList(payload["videos"]); len(videos) > 0 {
		body["videos"] = videos
	}
	endpoints, queries, headers := videoEndpoints(family, model, images)
	return videoAdapted{family: family, modelID: model, ratio: ratio, resolution: resolution, size: videoPixelSize(ratio, resolution), duration: duration, images: images, payload: body, endpoints: endpoints, queries: queries, headers: headers}
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

func videoEndpoints(family, model string, images []string) ([]string, []string, map[string]string) {
	return videoEndpointSet(family, model, images)
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

func persistVideoTask(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, adapted videoAdapted, taskID, prompt string) (string, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return "", err
	}
	defer db.Close()
	return insertImageTask(r.Context(), db, workspaceOf(r), imageTaskDraft{
		ProductID: rawString(payload, "productId"), Prompt: prompt, TaskID: taskID, Model: adapted.modelID,
		Size: adapted.ratio, Quality: adapted.resolution, Status: "IN_PROGRESS", MediaType: "video",
	})
}
