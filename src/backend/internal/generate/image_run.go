package generate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/modelgw"
	"beike.local/cloud/src/backend/internal/system"
)

type imageAdapted struct {
	family, modelID, prompt, size, endpoint string
	useEdits                                bool
	payload                                 map[string]any
}

func buildImagePayload(model, prompt, size, quality, imageQuality string, refs []string) imageAdapted {
	model, size, quality = normalizeGptImageRequest(model, size, quality)
	family := imageFamily(model)
	payload := map[string]any{"model": model, "prompt": prompt, "size": size, "n": 1}
	sentQuality := quality
	if chosen := normalizeImageQuality(imageQuality); chosen != "" {
		sentQuality = chosen
		if omitGptImageQuality(model) {
			sentQuality = ""
		}
	}
	if isGptImageModel(model) && sentQuality != "" {
		payload["quality"] = sentQuality
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
				return modelgw.DataImageURL(b64)
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
		value = normalizeImageRef(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	// Workshop reference numbers are explicit: preserve slots even when images repeat.
	if _, exists := payload["compositionReferenceImages"]; exists {
		ordered := []string{}
		for _, key := range []string{"productReferenceImages", "compositionReferenceImages"} {
			var items []string
			_ = json.Unmarshal(payload[key], &items)
			for _, item := range items {
				if value := normalizeImageRef(item); value != "" {
					ordered = append(ordered, value)
				}
			}
		}
		if face := normalizeImageRef(rawString(payload, "anchorFaceImageUrl")); face != "" {
			ordered = append(ordered, face)
		}
		return ordered
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

type imageClaim struct {
	recordID, reusedTaskID, reusedURL string
}

func claimImageSubmission(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model, prompt, quality, size, idempotencyKey string) (imageClaim, int, string) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	defer db.Close()
	key := strings.TrimSpace(idempotencyKey)
	if id, taskID, result, ok := reuseImageTask(r.Context(), db, workspaceOf(r), key); ok {
		return imageClaim{recordID: id, reusedTaskID: taskID, reusedURL: result}, 0, ""
	}
	placeholder, err := randomTaskID()
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	recordID, err := insertImageTask(r.Context(), db, workspaceOf(r), imageTaskDraft{
		ProductID: rawString(payload, "productId"), Prompt: prompt, TaskID: "pending_" + placeholder, Model: model,
		Size: size, Quality: quality, Status: "IN_PROGRESS", MediaType: "image", IdempotencyKey: key,
	})
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	return imageClaim{recordID: recordID}, 0, ""
}

func finishImageSubmission(cfg config.Config, r *http.Request, recordID string, adapted imageAdapted, taskID, direct, size string) error {
	db, err := openTaskDB(cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	state := "IN_PROGRESS"
	if direct != "" {
		state = "SUCCESS"
	}
	return settleImageSubmission(r.Context(), db, recordID, imageTaskDraft{
		TaskID: taskID, Status: state, ResultURL: direct, Model: adapted.modelID, Prompt: adapted.prompt, Size: size,
	})
}

func failImageSubmission(cfg config.Config, r *http.Request, recordID, reason string) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	_ = settleImageSubmission(r.Context(), db, recordID, imageTaskDraft{Status: "FAILURE", FailReason: reason})
}
