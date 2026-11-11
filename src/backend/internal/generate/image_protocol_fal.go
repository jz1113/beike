package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const falQwenImagePath = "/alibaba/qwen-image-3"

type falImageProtocol struct{}

func (falImageProtocol) ID() string { return "fal" }

func isFalQwenImage3(model string) bool {
	id := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(model)), "alibaba/")
	switch id {
	case "qwen-image-3", "qwen-image-3/edit", "qwen-image-3/text-to-image":
		return true
	}
	return false
}

func isFalImageBase(base string) bool {
	u, err := url.Parse(base)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (strings.EqualFold(u.Hostname(), "queue.fal.run") || strings.EqualFold(u.Hostname(), "fal.run"))
}

func falImageBase(base string) string {
	if isFalImageBase(base) {
		return "https://queue.fal.run"
	}
	return strings.TrimRight(gateway.NormalizeGatewayBaseURL(base), "/")
}

func (falImageProtocol) Submit(req imageRequest) (imageSubmitResult, error) {
	if !isFalQwenImage3(req.Model) {
		return imageSubmitResult{}, imageEditPrepareError{"当前 fal 生图渠道仅支持 Qwen Image 3"}
	}
	width, height, ok := dashscopePixelPair(strings.ToLower(strings.TrimSpace(req.Size)))
	if !ok || width < 1 || height < 1 || width > 4194304 || height > 4194304 || int64(width)*int64(height) < 262144 || int64(width)*int64(height) > 4194304 {
		return imageSubmitResult{}, imageEditPrepareError{"Qwen Image 3 需要 262144 至 4194304 总像素的宽高尺寸，请选择 1K 或 2K"}
	}
	path := falQwenImagePath + "/text-to-image"
	body := map[string]any{"prompt": req.Prompt, "image_size": map[string]int{"width": width, "height": height}, "num_images": 1}
	if req.Negative != "" {
		body["negative_prompt"] = req.Negative
	}
	if len(req.Refs) > 0 {
		if len(req.Refs) > 3 {
			return imageSubmitResult{}, imageEditPrepareError{"Qwen Image 3 图像编辑最多支持 3 张参考图"}
		}
		refs, err := dashscopeImageRefs(req)
		if err != nil {
			return imageSubmitResult{}, err
		}
		path = falQwenImagePath + "/edit"
		body["image_urls"] = refs
	}
	status, raw, err := gateway.PostModelHeaders(req.context(), http.MethodPost, falImageBase(req.Base)+path, "", body, 45*time.Second, falImageHeaders(req.APIKey))
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	adapted := imageAdapted{family: "fal", modelID: req.Model, prompt: req.Prompt, size: req.Size, endpoint: path}
	return imageSubmitResult{Status: status, Data: data, TaskID: firstString(data, "request_id"), Adapted: adapted}, err
}

func (falImageProtocol) Poll(req imagePollRequest) (pollParsed, map[string]any, bool) {
	// The fal queue uses the base endpoint for result URLs of both subpaths.
	endpoint := falImageBase(req.Base) + falQwenImagePath + "/requests/" + url.PathEscape(req.TaskID)
	headers := falImageHeaders(req.APIKey)
	status, raw, err := gateway.PostModelHeaders(req.context(), http.MethodGet, endpoint+"/status", "", nil, 5*time.Second, headers)
	data := map[string]any{}
	if err != nil || status < 200 || status >= 300 || json.Unmarshal(raw, &data) != nil {
		return pollParsed{}, nil, false
	}
	switch firstString(data, "status") {
	case "IN_QUEUE", "IN_PROGRESS":
		return pollParsed{status: "IN_PROGRESS", progress: progressText(data)}, data, true
	case "COMPLETED":
		if message := firstString(data, "error"); message != "" {
			return pollParsed{status: "FAILURE", reason: message, progress: "0%"}, data, true
		}
	default:
		return pollParsed{}, nil, false
	}
	status, raw, err = gateway.PostModelHeaders(req.context(), http.MethodGet, endpoint, "", nil, 5*time.Second, headers)
	result := map[string]any{}
	if err != nil || json.Unmarshal(raw, &result) != nil {
		return pollParsed{}, nil, false
	}
	if status == http.StatusUnprocessableEntity && result["detail"] != nil {
		return pollParsed{status: "FAILURE", reason: imageUpstreamError(result, status), progress: "0%"}, result, true
	}
	if status < 200 || status >= 300 {
		return pollParsed{}, nil, false
	}
	if images, ok := result["images"].([]any); ok && len(images) > 0 {
		if image, ok := images[0].(map[string]any); ok {
			if resultURL := specializedHTTPS(image["url"]); resultURL != "" {
				return pollParsed{status: "SUCCESS", result: resultURL, progress: "100%"}, result, true
			}
		}
	}
	return pollParsed{}, nil, false
}

func falImageHeaders(key string) map[string]string {
	return map[string]string{"Authorization": "Key " + key}
}
