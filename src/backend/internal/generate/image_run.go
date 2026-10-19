package generate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/modelgw"
	"beike.local/cloud/src/backend/internal/system"
)

func submitImage(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	model := "gpt-image-2"
	if raw, exists := payload["model"]; exists {
		model = jsString(raw)
	}
	base, apiKey := imageSubmitCredentials(cfg, r, payload, model)
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	refs := imageReferences(payload)
	size := rawString(payload, "size")
	if size == "" {
		size = rawString(payload, "aspectRatio")
	}
	if size == "" {
		size = "2448x3264"
	}
	quality := rawString(payload, "quality")
	if quality == "" {
		if rawString(payload, "source") == "hub" {
			quality = "medium"
		} else {
			quality = "high"
		}
	}
	protocol := resolveImageProtocol(base, imageProtocolName(payload, r.Header.Get("x-custom-protocol")))
	if protocol.ID() == "openai" && nativeDashscopeImageModel(model) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false, "submissionRejected": true,
			"error": "该模型需要使用千问原生生图接口。请在设置中把模型绑定到千问服务商，或将接口地址改为千问 / DashScope。",
		})
		return
	}
	result, err := protocol.Submit(imageRequest{
		HTTP: r, Base: base, APIKey: apiKey, Model: model, Prompt: prompt, Size: size, Quality: quality,
		Strength: rawString(payload, "inferenceStrength"), Negative: rawString(payload, "negativePrompt"),
		Refs: refs, Workspace: workspaceOf(r), Production: cfg.Production(), Template: imageRequestTemplate(payload),
	})
	adapted := result.Adapted
	status, data := result.Status, result.Data
	if err != nil {
		var prepare imageEditPrepareError
		if errors.As(err, &prepare) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": prepare.Error()})
			return
		}
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": imageSubmitTransportError(err)})
		return
	}
	taskID, direct := result.TaskID, result.Direct
	if taskID != "" {
		rememberImageTemplate(base, taskID, imageRequestTemplate(payload))
	}
	if status < 200 || status >= 300 || (taskID == "" && direct == "") {
		upstreamErr := imageUpstreamError(data, status)
		rejected := status >= 400 && status < 500
		outStatus := http.StatusBadGateway
		outcome := "unknown"
		if rejected {
			outStatus = http.StatusBadRequest
			outcome = "rejected"
		}
		body := map[string]any{
			"success":           false,
			"submissionOutcome": outcome,
			"error":             upstreamErr,
		}
		if rejected {
			body["submissionRejected"] = true
		}
		httpx.WriteJSON(w, outStatus, body)
		return
	}
	if taskID == "" {
		taskID = "direct_" + Itoa(int(time.Now().UnixMilli()))
	}
	recordID, reusedURL, statusCode, message := persistSubmittedImage(cfg, r, payload, adapted, taskID, direct, quality, size)
	if statusCode != 0 {
		httpx.WriteJSON(w, statusCode, map[string]any{"success": false, "error": message, "taskId": taskID})
		return
	}
	if reusedURL != "" {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "taskId": taskID, "status": "SUCCESS", "resultUrl": reusedURL, "reused": true})
		return
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "recordId": recordID, "model": adapted.modelID,
		"requestedModel": model, "size": adapted.size, "family": adapted.family,
		"usedEndpoint": adapted.endpoint, "status": "IN_PROGRESS", "prompt": adapted.prompt,
		"timing": map[string]any{"parseMs": 0, "convertMs": 0, "gatewayMs": 0, "dbMs": 0, "totalMs": 0, "payloadKB": 0, "imageCount": len(refs), "convertCacheHits": 0},
	}
	if direct != "" {
		body["status"] = "SUCCESS"
		body["resultUrl"] = direct
		body["temporaryUrl"] = strings.HasPrefix(direct, "http://") || strings.HasPrefix(direct, "https://")
	}
	if usage := NormalizeUsage(data); usage != nil {
		body["usage"] = usage
		rememberTaskUsage(r.Context(), cfg, taskID, usage)
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

type imageAdapted struct {
	family, modelID, prompt, size, endpoint string
	useEdits                                bool
	payload                                 map[string]any
}

func buildImagePayload(model, prompt, size, quality string, refs []string) imageAdapted {
	model, size, quality = normalizeGptImageRequest(model, size, quality)
	family := imageFamily(model)
	payload := map[string]any{"model": model, "prompt": prompt, "size": size, "n": 1}
	if family != "grok-image" && quality != "" {
		payload["quality"] = quality
	}
	if family == "grok-image" {
		delete(payload, "size")
		payload["aspect_ratio"] = "1:1"
	}
	if len(refs) > 0 {
		payload["image"] = refs
	}
	useEdits := len(refs) > 0 && (family == "openai-dalle" || family == "qwen-edit")
	endpoint := "generations"
	if useEdits {
		endpoint = "edits"
	}
	return imageAdapted{family: family, modelID: model, prompt: prompt, size: size, endpoint: endpoint, useEdits: useEdits, payload: payload}
}

func imageFamily(model string) string {
	id := strings.ToLower(model)
	switch {
	case strings.Contains(id, "gpt-image") || strings.Contains(id, "dall"):
		return "openai-dalle"
	case strings.Contains(id, "grok"):
		return "grok-image"
	case strings.Contains(id, "seedream") || strings.Contains(id, "doubao-seedream"):
		return "seedream"
	case id == "qwen-image-edit" || id == "qwen-image-edit-2509":
		return "qwen-edit"
	case strings.Contains(id, "flux"):
		return "flux"
	case strings.Contains(id, "midjourney"):
		return "midjourney"
	case strings.Contains(id, "nano-banana") || strings.Contains(id, "gemini"):
		return "gemini-nano"
	default:
		return "generic"
	}
}

func imageSubmitURLs(base string, edits bool, family, model string) []string {
	root := strings.TrimRight(system.NormalizeGatewayBaseURL(base), "/")
	if model == "openai/gpt-image-2" {
		path := "/v1/images/generations"
		if edits {
			path = "/v1/images/edits"
		}
		return []string{root + path}
	}
	if family == "qwen-edit" {
		return []string{root + "/v1/images/edits"}
	}
	if edits {
		return []string{root + "/v1/images/edits?async=true", root + "/v1/images/edits", root + "/v1/images/generations?async=true", root + "/v1/images/generations"}
	}
	return []string{root + "/v1/images/generations?async=true", root + "/v1/images/generations"}
}

func dispatchImage(r *http.Request, urls []string, apiKey string, payload map[string]any, workspace string, production bool) (int, map[string]any, error) {
	var lastStatus int
	var lastData map[string]any
	timeout := 45 * time.Second
	if payloadText(payload["model"]) == "openai/gpt-image-2" {
		timeout = 180 * time.Second
	}
	for _, endpoint := range urls {
		var status int
		var raw []byte
		var err error
		if isImageEditEndpoint(endpoint) {
			status, raw, err = postImageEdit(r.Context(), endpoint, apiKey, payload, workspace, production, timeout)
		} else {
			status, raw, err = PostModel(r.Context(), http.MethodPost, endpoint, apiKey, payload, timeout)
		}
		if err != nil {
			return 0, nil, err
		}
		data := map[string]any{}
		_ = json.Unmarshal(raw, &data)
		lastStatus, lastData = status, data
		taskID, direct := imageOutcome(data)
		if status >= 200 && status < 300 && (taskID != "" || direct != "") {
			return status, data, nil
		}
		if !modelgw.CanTryAnotherEndpoint(status) {
			return status, data, nil
		}
	}
	return lastStatus, lastData, nil
}

func imageOutcome(data map[string]any) (string, string) {
	if data == nil {
		return "", ""
	}
	if text, ok := data["task_id"].(string); ok && text != "" {
		return text, ""
	}
	if nested, ok := data["data"].(map[string]any); ok {
		if text, ok := nested["task_id"].(string); ok && text != "" {
			return text, imageDirect(data)
		}
	}
	if text, ok := data["data"].(string); ok && text != "" {
		return text, imageDirect(data)
	}
	if text, ok := data["id"].(string); ok && text != "" {
		return text, imageDirect(data)
	}
	return "", imageDirect(data)
}

func imageDirect(data map[string]any) string {
	if items, ok := data["data"].([]any); ok && len(items) > 0 {
		if item, ok := items[0].(map[string]any); ok {
			if url, ok := item["url"].(string); ok && url != "" {
				return url
			}
			if b64, ok := item["b64_json"].(string); ok && b64 != "" {
				return "data:image/png;base64," + b64
			}
		}
	}
	for _, key := range []string{"url", "output", "image_url"} {
		if text, ok := data[key].(string); ok && text != "" {
			return text
		}
	}
	return ""
}

func imageUpstreamError(data map[string]any, status int) string {
	if data != nil {
		if text, ok := data["message"].(string); ok && text != "" {
			return text
		}
		if text, ok := data["fail_reason"].(string); ok && text != "" {
			return text
		}
		if text, ok := data["detail"].(string); ok && text != "" {
			return text
		}
		if nested, ok := data["error"].(map[string]any); ok {
			if text, ok := nested["message"].(string); ok && text != "" {
				return text
			}
		}
		if text, ok := data["error"].(string); ok && text != "" {
			return text
		}
	}
	if status == http.StatusUnauthorized {
		return "API 凭证未配置或令牌不合法，请前往「⚙️ 设置 -> 服务接口配置」检查并填入有效凭证"
	}
	if status == http.StatusPaymentRequired {
		return "AI 服务商账户余额不足，请充值后重试"
	}
	return "上游接口响应异常 (HTTP " + Itoa(status) + ")"
}

func imageReferences(payload map[string]json.RawMessage) []string {
	seen := map[string]struct{}{}
	var out []string
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	for _, key := range []string{"productImageUrl", "referenceImageUrl", "anchorFaceImageUrl", "sceneAnchorImageUrl"} {
		add(rawString(payload, key))
	}
	for _, key := range []string{"images", "referenceImages", "productReferenceImages"} {
		var items []json.RawMessage
		if json.Unmarshal(payload[key], &items) != nil {
			continue
		}
		for _, item := range items {
			var text string
			if json.Unmarshal(item, &text) == nil {
				add(text)
			}
		}
	}
	return out
}

func imageSubmitTransportError(err error) string {
	message := err.Error()
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(message), "context deadline exceeded") {
		message = "上游生图超时"
	}
	return "提交响应未确认：" + message + "。请先在上游任务记录核实是否已创建任务，避免重复生成"
}

func imageSubmitCredentials(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model string) (string, string) {
	if model == "openai/gpt-image-2" {
		return lianchiImageBase, strings.TrimSpace(r.Header.Get("x-lianchi-api-key"))
	}
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

func persistSubmittedImage(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, adapted imageAdapted, taskID, direct, quality, size string) (string, string, int, string) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return "", "", http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	defer db.Close()
	key := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if id, result, ok := reuseImageTask(r.Context(), db, workspaceOf(r), key); ok {
		return id, result, 0, ""
	}
	state := "IN_PROGRESS"
	if direct != "" {
		state = "SUCCESS"
	}
	recordID, err := insertImageTask(r.Context(), db, workspaceOf(r), imageTaskDraft{
		ProductID: rawString(payload, "productId"), Prompt: adapted.prompt, TaskID: taskID, Model: adapted.modelID,
		Size: size, Quality: quality, ResultURL: direct, Status: state, MediaType: "image", IdempotencyKey: key,
	})
	if err != nil {
		return "", "", http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	return recordID, "", 0, ""
}
