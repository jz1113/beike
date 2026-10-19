package generate

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/system"
)

type dashscopeImageProtocol struct{}

func (dashscopeImageProtocol) ID() string { return "dashscope" }

func (dashscopeImageProtocol) Submit(req imageRequest) (imageSubmitResult, error) {
	kind, reject := dashscopeImageKind(req.Model)
	adapted := imageAdapted{
		family: "dashscope-" + kind, modelID: req.Model, prompt: req.Prompt, size: req.Size, endpoint: kind,
	}
	if reject != "" {
		return imageSubmitResult{Status: http.StatusBadRequest, Data: map[string]any{"message": reject}, Adapted: adapted}, nil
	}
	images, err := dashscopeImageRefs(req)
	if err != nil {
		return imageSubmitResult{}, err
	}
	size := dashscopePixelSize(req.Model, req.Size, req.Quality)
	adapted.size = strings.ReplaceAll(size, "*", "x")
	body := dashscopeImageBody(req, kind, images, size)
	endpoint := system.DashScopeRoot(req.Base) + dashscopeImagePath(kind)
	headers := map[string]string{}
	timeout := 180 * time.Second
	if kind == "wan" {
		headers["X-DashScope-Async"] = "enable"
		timeout = 45 * time.Second
		adapted.endpoint = "image-generation"
	} else {
		adapted.endpoint = "multimodal-generation"
	}
	adapted.payload = body
	status, raw, err := PostModelHeaders(req.context(), http.MethodPost, endpoint, req.APIKey, body, timeout, headers)
	if err != nil {
		return imageSubmitResult{}, err
	}
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	if message := dashscopeFailure(data, status); message != "" && dashscopeImageURL(data) == "" && dashscopeTaskID(data) == "" {
		outStatus := status
		if outStatus < 400 || outStatus >= 500 {
			outStatus = http.StatusBadRequest
		}
		data["message"] = message
		return imageSubmitResult{Status: outStatus, Data: data, Adapted: adapted}, nil
	}
	return imageSubmitResult{
		Status: status, Data: data, TaskID: dashscopeTaskID(data), Direct: dashscopeImageURL(data), Adapted: adapted,
	}, nil
}

func (dashscopeImageProtocol) Poll(req imagePollRequest) (pollParsed, map[string]any, bool) {
	endpoint := system.DashScopeRoot(req.Base) + "/api/v1/tasks/" + url.PathEscape(req.TaskID)
	status, raw, err := PostModel(req.context(), http.MethodGet, endpoint, req.APIKey, nil, 8*time.Second)
	if err != nil || status < 200 || status >= 300 {
		return pollParsed{}, nil, false
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil {
		return pollParsed{}, nil, false
	}
	state := strings.ToUpper(dashscopeTaskStatus(data))
	image := dashscopeImageURL(data)
	switch state {
	case "PENDING", "RUNNING", "SUSPENDED":
		return pollParsed{status: "IN_PROGRESS", progress: "50%"}, data, true
	case "SUCCEEDED":
		if image == "" {
			return pollParsed{status: "IN_PROGRESS", progress: "90%"}, data, true
		}
		return pollParsed{status: "SUCCESS", result: image, progress: "100%"}, data, true
	case "FAILED", "CANCELED", "CANCELLED", "UNKNOWN":
		reason := dashscopeFailure(data, status)
		if reason == "" {
			reason = "上游明确返回任务失败"
		}
		return pollParsed{status: "FAILURE", reason: reason, progress: "0%"}, data, true
	default:
		if image != "" {
			return pollParsed{status: "SUCCESS", result: image, progress: "100%"}, data, true
		}
		return pollParsed{}, data, false
	}
}

func dashscopeImageKind(model string) (string, string) {
	id := strings.ToLower(strings.TrimSpace(model))
	switch {
	case strings.Contains(id, "qwen-image"):
		return "qwen", ""
	case strings.Contains(id, "wan2.7-image"), strings.Contains(id, "wan2.6-image"), strings.Contains(id, "wan2.6-t2i"):
		return "wan", ""
	case strings.Contains(id, "wan"):
		return "wan", "该万相版本暂未适配，请使用 wan2.6 或 wan2.7 图像模型"
	default:
		return "qwen", "该模型暂未适配千问原生生图接口"
	}
}

func dashscopeImagePath(kind string) string {
	if kind == "wan" {
		return "/api/v1/services/aigc/image-generation/generation"
	}
	return "/api/v1/services/aigc/multimodal-generation/generation"
}

func dashscopeImageBody(req imageRequest, kind string, images []string, size string) map[string]any {
	content := make([]any, 0, len(images)+1)
	for _, image := range images {
		content = append(content, map[string]any{"image": image})
	}
	content = append(content, map[string]any{"text": req.Prompt})
	extend, thinking := dashscopeRewrite(req.Strength)
	parameters := map[string]any{"size": size, "n": 1, "watermark": false}
	id := strings.ToLower(req.Model)
	if strings.Contains(id, "wan2.7-image") {
		parameters["thinking_mode"] = extend || thinking
	} else {
		parameters["prompt_extend"] = extend
		if thinking && (strings.Contains(id, "qwen-image-3") || strings.Contains(id, "qwen-image-2.1-pro") || strings.Contains(id, "qwen-image-2-1-pro")) {
			parameters["enable_thinking"] = true
		}
		if text := strings.TrimSpace(req.Negative); text != "" {
			parameters["negative_prompt"] = text
		}
	}
	return map[string]any{
		"model": req.Model,
		"input": map[string]any{
			"messages": []any{map[string]any{"role": "user", "content": content}},
		},
		"parameters": parameters,
	}
}

func dashscopeRewrite(strength string) (extend bool, thinking bool) {
	switch strings.ToLower(strings.TrimSpace(strength)) {
	case "low":
		return false, false
	case "medium":
		return true, false
	default:
		return true, true
	}
}

func dashscopeImageRefs(req imageRequest) ([]string, error) {
	out := make([]string, 0, len(req.Refs))
	for index, ref := range req.Refs {
		value, err := dashscopeImageRef(req.context(), ref, index, req.Workspace, req.Production)
		if err != nil {
			return nil, err
		}
		if value != "" {
			out = append(out, value)
		}
	}
	return out, nil
}

func dashscopeImageRef(ctx context.Context, ref string, index int, workspace string, production bool) (string, error) {
	ref = strings.TrimSpace(ref)
	lower := strings.ToLower(ref)
	switch {
	case strings.HasPrefix(lower, "https://"), strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "data:image/"):
		return ref, nil
	case strings.HasPrefix(ref, "/storage/"):
		file, err := loadEditImage(ctx, ref, index, workspace, production)
		if err != nil {
			return "", err
		}
		return "data:" + file.mime + ";base64," + base64.StdEncoding.EncodeToString(file.data), nil
	case ref == "":
		return "", nil
	default:
		return "", imageEditPrepareError{"不支持的参考图地址"}
	}
}

func dashscopeImageURL(data map[string]any) string {
	output, _ := data["output"].(map[string]any)
	if output == nil {
		return ""
	}
	if choices, ok := output["choices"].([]any); ok {
		for _, choice := range choices {
			item, _ := choice.(map[string]any)
			message, _ := item["message"].(map[string]any)
			content, _ := message["content"].([]any)
			for _, part := range content {
				node, _ := part.(map[string]any)
				if text, ok := node["image"].(string); ok && strings.TrimSpace(text) != "" {
					return strings.TrimSpace(text)
				}
			}
		}
	}
	if results, ok := output["results"].([]any); ok {
		for _, result := range results {
			node, _ := result.(map[string]any)
			if text, ok := node["url"].(string); ok && strings.TrimSpace(text) != "" {
				return strings.TrimSpace(text)
			}
		}
	}
	return ""
}

func dashscopeTaskID(data map[string]any) string {
	if output, ok := data["output"].(map[string]any); ok {
		if text, ok := output["task_id"].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	if text, ok := data["task_id"].(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func dashscopeTaskStatus(data map[string]any) string {
	if output, ok := data["output"].(map[string]any); ok {
		if text, ok := output["task_status"].(string); ok && text != "" {
			return text
		}
	}
	if text, ok := data["task_status"].(string); ok {
		return text
	}
	return ""
}

func dashscopeFailure(data map[string]any, status int) string {
	code := dashscopeCode(data)
	switch {
	case code == "DataInspectionFailed":
		return "内容审核未通过，请修改提示词后重试"
	case strings.HasPrefix(code, "Throttling"), status == http.StatusTooManyRequests:
		return "触发限流，请稍后重试"
	case code == "InvalidApiKey":
		return "API 密钥无效，请检查千问服务商配置"
	case code != "" && status >= 400:
		if text := dashscopeMessage(data); text != "" {
			return text
		}
		return code
	case status >= 400:
		return imageUpstreamError(data, status)
	default:
		return ""
	}
}

func dashscopeCode(data map[string]any) string {
	if text, ok := data["code"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	if output, ok := data["output"].(map[string]any); ok {
		if text, ok := output["code"].(string); ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func dashscopeMessage(data map[string]any) string {
	if text, ok := data["message"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	if output, ok := data["output"].(map[string]any); ok {
		if text, ok := output["message"].(string); ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}
