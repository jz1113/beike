package generate

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func submitImage(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	status, body := executeImageSubmission(cfg, r, payload, r.Header.Get("x-idempotency-key"))
	httpx.WriteJSON(w, status, body)
}

func executeImageSubmission(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, idempotencyKey string) (int, map[string]any) {
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
	imageQuality := normalizeImageQuality(rawString(payload, "imageQuality"))
	protocol := resolveImageProtocol(base, imageProtocolName(payload, r.Header.Get("x-custom-protocol")))
	if protocol.ID() == "openai" && nativeDashscopeImageModel(model) {
		return http.StatusBadRequest, map[string]any{
			"success": false, "submissionRejected": true,
			"error": "该模型需要使用千问原生生图接口。请在设置中把模型绑定到千问服务商，或将接口地址改为千问 / DashScope。",
		}
	}
	claim, statusCode, message := claimImageSubmission(cfg, r, payload, model, prompt, quality, size, idempotencyKey)
	if statusCode != 0 {
		return statusCode, map[string]any{"success": false, "error": message}
	}
	if claim.reusedURL != "" {
		return http.StatusOK, map[string]any{"success": true, "taskId": claim.reusedTaskID, "status": "SUCCESS", "resultUrl": claim.reusedURL, "reused": true}
	}
	result, err := protocol.Submit(imageRequest{
		HTTP: r, Base: base, APIKey: apiKey, Model: model, Prompt: prompt, Size: size, Quality: quality, ImageQuality: imageQuality,
		Strength: rawString(payload, "inferenceStrength"), Negative: rawString(payload, "negativePrompt"),
		Refs: refs, Workspace: workspaceOf(r), Production: cfg.Production(), Template: imageRequestTemplate(payload),
	})
	adapted := result.Adapted
	status, data := result.Status, result.Data
	if err != nil {
		var prepare imageEditPrepareError
		if errors.As(err, &prepare) {
			failImageSubmission(cfg, r, claim.recordID, prepare.Error())
			return http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "submissionOutcome": "rejected", "error": prepare.Error()}
		}
		transportErr := imageSubmitTransportError(err)
		failImageSubmission(cfg, r, claim.recordID, transportErr)
		return http.StatusInternalServerError, map[string]any{"success": false, "error": transportErr}
	}
	taskID, direct := result.TaskID, result.Direct
	if taskID != "" {
		rememberImageTemplate(base, taskID, imageRequestTemplate(payload))
	}
	if status < 200 || status >= 300 || (taskID == "" && direct == "") {
		upstreamErr := imageUpstreamError(data, status)
		failImageSubmission(cfg, r, claim.recordID, upstreamErr)
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
		return outStatus, body
	}
	if taskID == "" {
		nonce, nonceErr := randomTaskID()
		if nonceErr != nil {
			return http.StatusInternalServerError, map[string]any{"success": false, "error": "任务持久化失败: " + nonceErr.Error()}
		}
		taskID = "direct_" + Itoa(int(time.Now().UnixMilli())) + "_" + nonce
	}
	if err := finishImageSubmission(cfg, r, claim.recordID, adapted, taskID, direct, size); err != nil {
		return http.StatusInternalServerError, map[string]any{"success": false, "error": "任务持久化失败: " + err.Error(), "taskId": taskID}
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "recordId": claim.recordID, "model": adapted.modelID,
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
	return http.StatusOK, body
}

func workshopProductImageError(payload map[string]json.RawMessage) string {
	if rawString(payload, "workshopMode") != "storyboard_generate" {
		return ""
	}
	if strings.TrimSpace(rawString(payload, "productImageUrl")) == "" {
		return "原创生图缺少商品垫图（@图片1）。请在素材步选好商品图并开启「强制跟商品图」。"
	}
	return ""
}

func Itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
