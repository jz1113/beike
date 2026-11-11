package generate

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

type imageAdapted struct {
	family, modelID, prompt, size, endpoint string
	useEdits                                bool
	payload                                 map[string]any
}

func buildImagePayload(model, prompt, size, quality, imageQuality string, refs []string) imageAdapted {
	return buildImagePayloadWithAspect(model, prompt, size, "", quality, imageQuality, refs)
}

func buildImagePayloadWithAspect(model, prompt, size, aspectRatio, quality, imageQuality string, refs []string) imageAdapted {
	rawSize, rawQuality := size, quality
	model, size, quality = normalizeGptImageRequest(model, size, quality)
	family := imageFamily(model)
	payload := map[string]any{"model": model, "prompt": prompt, "size": size, "n": 1}
	sentQuality := quality
	if chosen := normalizeImageQuality(imageQuality); chosen != "" {
		sentQuality = gptImageWireQuality(model, chosen, gptImageQualityTier(chosen))
		if omitGptImageQuality(model) {
			sentQuality = ""
		}
	}
	if isGptImageModel(model) && sentQuality != "" {
		payload["quality"] = sentQuality
	}
	switch family {
	case "seedream":
		if model == "seedream-v5-pro" {
			size = seedreamPixelSize(size)
			payload["size"] = size
			payload["response_format"] = "url"
			delete(payload, "n")
		}
	case "grok-image":
		delete(payload, "size")
		payload["aspect_ratio"] = grokAspectRatio(rawSize, aspectRatio)
	case "gemini-nano":
		delete(payload, "size")
		delete(payload, "n")
		delete(payload, "quality")
		payload["response_format"] = "url"
		ratio := resolveGeminiAspectRatio(model, rawSize, aspectRatio)
		if ratio != "" {
			payload["aspect_ratio"] = ratio
			payload["aspectRatio"] = ratio
		}
		imageSize := resolveGeminiImageSize(model, rawSize, rawQuality, imageQuality)
		if imageSize != "" {
			payload["image_size"] = imageSize
			payload["imageSize"] = imageSize
		}
		size = geminiOfficialPixelSize(model, ratio, imageSize)
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
	case isFalQwenImage3(id):
		return "fal"
	case strings.Contains(id, "seedream") || strings.Contains(id, "doubao-seedream"):
		return "seedream"
	case id == "qwen-image-edit" || id == "qwen-image-edit-2509":
		return "qwen-edit"
	case strings.Contains(id, "flux"):
		return "flux"
	case strings.Contains(id, "midjourney"):
		return "midjourney"
	case isGeminiImageModel(id):
		return "gemini-nano"
	default:
		return "generic"
	}
}

func imageSubmitURLs(base string, edits bool, family, model string) []string {
	_ = model
	root := strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
	if u, err := url.Parse(root); err == nil && u.Hostname() == "api.openai.com" && family == "openai-dalle" {
		if edits {
			return []string{root + "/v1/images/edits"}
		}
		return []string{root + "/v1/images/generations"}
	}
	if family == "qwen-edit" {
		return []string{root + "/v1/images/edits"}
	}
	if edits {
		return []string{root + "/v1/images/edits?async=true", root + "/v1/images/edits", root + "/v1/images/generations?async=true", root + "/v1/images/generations"}
	}
	return []string{root + "/v1/images/generations?async=true", root + "/v1/images/generations"}
}

func submitArkImage(req imageRequest, adapted imageAdapted) (imageSubmitResult, error) {
	size, maxRefs := arkSeedreamSize(req.Model, req.Size)
	if size == "" {
		return imageSubmitResult{}, imageEditPrepareError{"当前尺寸或型号不符合火山方舟 Seedream 规格，请核对所选分辨率与官方模型 ID"}
	}
	if len(req.Refs) > maxRefs {
		return imageSubmitResult{}, imageEditPrepareError{"参考图超过当前 Seedream 模型的上限"}
	}
	refs, err := dashscopeImageRefs(req)
	if err != nil {
		return imageSubmitResult{}, err
	}
	u, _ := url.Parse(req.Base)
	endpoint := u.Scheme + "://" + u.Host + "/api/v3/images/generations"
	body := map[string]any{"model": req.Model, "prompt": req.Prompt, "size": size, "response_format": "url"}
	if len(refs) > 0 {
		body["image"] = refs
	}
	adapted.size, adapted.endpoint = size, "/api/v3/images/generations"
	return postDirectImage(req, adapted, endpoint, body)
}

func submitXAIImage(req imageRequest, adapted imageAdapted) (imageSubmitResult, error) {
	if len(req.Refs) > 5 {
		return imageSubmitResult{}, imageEditPrepareError{"xAI 图像编辑最多支持 5 张参考图"}
	}
	refs, err := dashscopeImageRefs(req)
	if err != nil {
		return imageSubmitResult{}, err
	}
	body := adapted.payload
	delete(body, "image")
	adapted.endpoint = "/v1/images/generations"
	if len(refs) > 0 {
		adapted.endpoint = "/v1/images/edits"
		images := make([]map[string]string, 0, len(refs))
		for _, ref := range refs {
			images = append(images, map[string]string{"type": "image_url", "url": ref})
		}
		if len(images) == 1 {
			body["image"] = images[0]
		} else {
			body["images"] = images
		}
	}
	endpoint := strings.TrimRight(gateway.NormalizeGatewayBaseURL(req.Base), "/") + adapted.endpoint
	return postDirectImage(req, adapted, endpoint, body)
}

func postDirectImage(req imageRequest, adapted imageAdapted, endpoint string, body map[string]any) (imageSubmitResult, error) {
	status, raw, err := gateway.PostModel(req.context(), http.MethodPost, endpoint, req.APIKey, body, 180*time.Second)
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	_, direct := imageOutcome(data)
	if items, ok := data["data"].([]any); ok && len(items) > 0 {
		if item, ok := items[0].(map[string]any); ok && firstString(item, "size") != "" {
			adapted.size = firstString(item, "size")
		}
	}
	return imageSubmitResult{Status: status, Data: data, Direct: direct, Adapted: adapted}, err
}

func dispatchImage(r *http.Request, urls []string, apiKey string, payload map[string]any, workspace string, production bool) (int, map[string]any, error) {
	var lastStatus int
	var lastData map[string]any
	timeout := 45 * time.Second
	if len(urls) == 1 && imageHostIs(urls[0], "api.openai.com") {
		timeout = 180 * time.Second
	}
	for _, endpoint := range urls {
		var status int
		var raw []byte
		var err error
		if isImageEditEndpoint(endpoint) {
			status, raw, err = postImageEdit(r.Context(), endpoint, apiKey, payload, workspace, production, timeout)
		} else {
			status, raw, err = gateway.PostModel(r.Context(), http.MethodPost, endpoint, apiKey, payload, timeout)
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
		if !gateway.CanTryAnotherEndpoint(status) {
			return status, data, nil
		}
	}
	return lastStatus, lastData, nil
}

func imageOutcome(data map[string]any) (string, string) {
	if data == nil {
		return "", ""
	}
	if data["error"] != nil || geminiFinishFailure(data) != "" {
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
				return gateway.DataImageURL(b64)
			}
		}
	}
	for _, key := range []string{"url", "output", "image_url"} {
		if text, ok := data[key].(string); ok && text != "" {
			return text
		}
	}
	return geminiImageDirect(data)
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
		if reason := geminiFinishFailure(data); reason != "" {
			return reason
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
	_ = model
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

func finishImageSubmission(cfg config.Config, r *http.Request, recordID string, adapted imageAdapted, taskID, direct, size string) error {
	state := "IN_PROGRESS"
	if direct != "" {
		state = "SUCCESS"
	}
	return settleImageReceipt(cfg, r, recordID, imageTaskDraft{
		TaskID: taskID, Status: state, ResultURL: direct, Model: adapted.modelID, Prompt: adapted.prompt, Size: size,
	})
}

func settleImageReceipt(cfg config.Config, r *http.Request, recordID string, patch imageTaskDraft) error {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	db, err := openTaskDB(cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	return settleImageSubmission(ctx, db, recordID, patch)
}

func failImageSubmission(cfg config.Config, r *http.Request, recordID, reason string) {
	_ = settleImageReceipt(cfg, r, recordID, imageTaskDraft{Status: "FAILURE", FailReason: reason})
}

func unknownImageSubmission(cfg config.Config, r *http.Request, recordID, taskID, reason string) {
	_ = settleImageReceipt(cfg, r, recordID, imageTaskDraft{Status: "SUBMISSION_UNKNOWN", TaskID: taskID, FailReason: reason})
}
