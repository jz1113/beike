package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func submitImage(cfg config.Config, w http.ResponseWriter, r *http.Request, payload map[string]json.RawMessage) {
	if r.Context().Err() != nil {
		httpx.WriteJSON(w, http.StatusRequestTimeout, map[string]any{"success": false, "submitted": false, "submissionRejected": true, "retryable": true, "error": "请求已断开，尚未提交生图"})
		return
	}
	// Reloading the browser must not discard an accepted provider response. Keep
	// this HTTP submission bounded and persist its receipt for task-key recovery.
	// Background workers still retain their own cancellation in RunImageTask.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 20*time.Minute)
	defer cancel()
	r = r.WithContext(ctx)
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
	aspectRatio := rawString(payload, "aspectRatio")
	if aspectRatio == "" {
		aspectRatio = rawString(payload, "aspect_ratio")
	}
	if aspectRatio == "" {
		aspectRatio = rawString(payload, "ar")
	}
	size := rawString(payload, "size")
	if size == "" {
		size = aspectRatio
	}
	if size == "" {
		size = "2448x3264"
		if model == "seedream-v5-pro" {
			size = "2048x2048"
		}
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
	if claim.reused {
		return reusedImageSubmission(claim)
	}
	result, err := protocol.Submit(imageRequest{
		HTTP: r, Base: base, APIKey: apiKey, Model: model, Prompt: prompt, Size: size, AspectRatio: aspectRatio, Quality: quality, ImageQuality: imageQuality,
		Strength: rawString(payload, "inferenceStrength"), Negative: rawString(payload, "negativePrompt"),
		Refs: refs, Workspace: workspaceOf(r), Production: cfg.Production(), Template: imageRequestTemplate(payload),
	})
	adapted := result.Adapted
	status, data := result.Status, result.Data
	failureReceipt := func(body map[string]any) map[string]any {
		body["recordId"] = claim.recordID
		if usage := gateway.NormalizeUsage(data); usage != nil {
			body["usage"] = usage
			rememberTaskUsage(r.Context(), cfg, taskScope{workspace: workspaceOf(r), media: "image", recordID: claim.recordID}, claim.row.taskID, usage)
		}
		return body
	}

	if err != nil {
		var prepare imageEditPrepareError
		if errors.As(err, &prepare) {
			failImageSubmission(cfg, r, claim.recordID, prepare.Error())
			return http.StatusBadRequest, map[string]any{"success": false, "submissionRejected": true, "submissionOutcome": "rejected", "error": prepare.Error()}
		}
		transportErr := imageSubmitTransportError(err)
		unknownImageSubmission(cfg, r, claim.recordID, "", transportErr)
		return http.StatusInternalServerError, failureReceipt(map[string]any{"success": false, "submissionUnknown": true, "submissionOutcome": "unknown", "taskKey": claim.key, "error": transportErr})
	}
	taskID, direct := result.TaskID, result.Direct
	if taskID != "" {
		rememberImageTemplate(base, taskID, imageRequestTemplate(payload))
	}
	if status < 200 || status >= 300 || (taskID == "" && direct == "") {
		upstreamErr := imageUpstreamError(data, status)
		rejected := status >= 400 && status < 500 && status != http.StatusRequestTimeout
		if rejected {
			failImageSubmission(cfg, r, claim.recordID, upstreamErr)
		} else {
			unknownImageSubmission(cfg, r, claim.recordID, taskID, upstreamErr)
		}
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
		body["taskKey"] = claim.key
		if rejected {
			body["submissionRejected"] = true
		} else {
			body["submissionUnknown"] = true
			if taskID != "" {
				body["taskId"] = taskID
			}
		}
		return outStatus, failureReceipt(body)
	}
	if taskID == "" {
		nonce, nonceErr := randomTaskID()
		if nonceErr != nil {
			return http.StatusInternalServerError, map[string]any{"success": false, "error": "任务持久化失败: " + nonceErr.Error()}
		}
		taskID = "direct_" + Itoa(int(time.Now().UnixMilli())) + "_" + nonce
	}
	receivedUsage := gateway.NormalizeUsage(data)
	if receivedUsage != nil {
		rememberTaskUsage(r.Context(), cfg, taskScope{workspace: workspaceOf(r), media: "image", recordID: claim.recordID}, taskID, receivedUsage)
	}
	if err := finishImageSubmission(cfg, r, claim.recordID, adapted, taskID, direct, size); err != nil {
		return http.StatusInternalServerError, map[string]any{"success": false, "error": "任务持久化失败: " + err.Error(), "taskId": taskID, "recordId": claim.recordID, "usage": receivedUsage}
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "taskKey": claim.key, "recordId": claim.recordID, "model": adapted.modelID,
		"requestedModel": model, "size": adapted.size, "family": adapted.family,
		"usedEndpoint": adapted.endpoint, "status": "IN_PROGRESS", "prompt": adapted.prompt,
		"timing": map[string]any{"parseMs": 0, "convertMs": 0, "gatewayMs": 0, "dbMs": 0, "totalMs": 0, "payloadKB": 0, "imageCount": len(refs), "convertCacheHits": 0},
	}
	if direct != "" {
		body["status"] = "SUCCESS"
		body["resultUrl"] = direct
		body["temporaryUrl"] = strings.HasPrefix(direct, "http://") || strings.HasPrefix(direct, "https://")
	}
	if receivedUsage != nil {
		body["usage"] = receivedUsage
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

// GenerateImageURL submits a prompt through the image family router and returns a direct URL.
func GenerateImageURL(ctx context.Context, base, key, model, prompt, size string) (string, error) {
	if strings.TrimSpace(key) == "" || strings.TrimSpace(base) == "" {
		return "", errors.New("未配置生图密钥")
	}
	protocol := resolveImageProtocol(base, "")
	result, err := protocol.Submit(imageRequest{
		Ctx: ctx, Base: base, APIKey: key, Model: model, Prompt: prompt, Size: size, Quality: "hd",
	})
	if err != nil {
		return "", errors.New("生图请求失败")
	}
	if result.Direct != "" {
		return result.Direct, nil
	}
	if result.TaskID != "" && result.Status >= 200 && result.Status < 300 {
		return pollImageURL(ctx, protocol, base, key, model, result.TaskID)
	}
	if result.Status != 0 {
		return "", errors.New(imageUpstreamError(result.Data, result.Status))
	}
	return "", errors.New("生图接口未返回图片")
}

func pollImageURL(ctx context.Context, protocol imageProtocol, base, key, model, taskID string) (string, error) {
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		parsed, _, ok := protocol.Poll(imagePollRequest{Ctx: ctx, Base: base, APIKey: key, TaskID: taskID, Model: model})
		if ok && parsed.status == "SUCCESS" && parsed.result != "" {
			return parsed.result, nil
		}
		if ok && parsed.status == "FAILURE" {
			reason := parsed.reason
			if reason == "" {
				reason = "生图任务失败"
			}
			return "", errors.New(reason)
		}
		select {
		case <-ctx.Done():
			return "", errors.New("生图超时")
		case <-time.After(2 * time.Second):
		}
	}
	return "", errors.New("生图超时")
}

const ImageGatewayMismatch = "当前接口地址与服务器允许的视觉网关不一致。请在设置 → 服务接口配置中改为服务器配置的网关地址，或联系管理员配置该网关；密钥未发送到其他网关。"

func imageGatewayError(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model string) (int, map[string]any) {
	_ = model
	clientBase := rawString(payload, "customBaseUrl")
	if clientBase == "" {
		clientBase = strings.TrimSpace(r.Header.Get("x-custom-base-url"))
	}
	format := rawString(payload, "apiFormat")
	allowHTTP := rawBool(payload, "allowInsecureHttp")
	if clientBase != "" && !system.AllowCustomBase(cfg) && !system.SafeHTTPSGateway(clientBase) && !(format == "openai-responses" && allowHTTP && system.PublicHTTPGateway(clientBase)) {
		return http.StatusBadRequest, map[string]any{"success": false, "error": ImageGatewayMismatch, "code": "gateway_base_url"}
	}
	if imageAPIKey(cfg, r, payload, clientBase) == "" {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "未配置 AI 绘图接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入您的 Comfly API 凭证后使用。", "missingConfig": "apiKey"}
	}
	return 0, nil
}

func imageAPIKey(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, clientBase string) string {
	key := rawString(payload, "customApiKey")
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("x-custom-api-key"))
	}
	defaults := ImageDefaultBase()
	thirdParty := clientBase != "" && gateway.NormalizeGatewayBaseURL(clientBase) != gateway.NormalizeGatewayBaseURL(defaults)
	if key == "" && !thirdParty && !cfg.Production() {
		key = strings.TrimSpace(os.Getenv("AI_DRAWING_API_KEY"))
		if key == "" {
			key = strings.TrimSpace(os.Getenv("AI_API_KEY"))
		}
	}
	return key
}

func ImageDefaultBase() string {
	for _, key := range []string{"AI_DRAWING_BASE_URL", "AI_DRAWING_API_BASE_URL", "AI_API_BASE", "AI_BASE_URL"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return "https://ai.comfly.org"
}

func imageHostIs(base, root string) bool {
	parsed, err := url.Parse(base)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == root || strings.HasSuffix(host, "."+root)
}

func rawString(payload map[string]json.RawMessage, key string) string {
	var value string
	if json.Unmarshal(payload[key], &value) != nil {
		return ""
	}
	return strings.TrimSpace(value)
}

func rawBool(payload map[string]json.RawMessage, key string) bool {
	var value bool
	if json.Unmarshal(payload[key], &value) != nil {
		return false
	}
	return value
}
