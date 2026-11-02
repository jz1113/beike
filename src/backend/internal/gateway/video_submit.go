package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
)

var errorURLPattern = regexp.MustCompile(`https?://[^\s"'<>|，。；：！？]+`)

type SubmitOutcome string

const (
	Accepted SubmitOutcome = "accepted"
	Rejected SubmitOutcome = "rejected"
	Unknown  SubmitOutcome = "unknown"
)

type SubmitResult struct {
	Outcome          SubmitOutcome
	TaskID           string
	Error            string
	EndpointAttempts int
	UsedSubmitURL    string
	UpstreamStatus   int
}

type SubmitCommand struct {
	Endpoints           []string
	APIKey              string
	PayloadJSON         string
	Headers             map[string]string
	ReadTaskID          func(map[string]any) string
	Client              *http.Client
	RetryOnMissingInput bool
}

func SubmitVideo(ctx context.Context, command SubmitCommand) SubmitResult {
	client := command.Client
	if client == nil {
		client = &http.Client{}
	}
	result := SubmitResult{Outcome: Rejected, Error: "视频接口未提供可用提交端点"}
	for _, endpoint := range command.Endpoints {
		result.EndpointAttempts++
		result.UsedSubmitURL = endpoint
		timeout := 20 * time.Second
		if result.EndpointAttempts == 1 {
			timeout = 180 * time.Second
		}
		attemptCtx, cancel := context.WithTimeout(ctx, timeout)
		status, data, err := postJSON(attemptCtx, client, endpoint, command)
		cancel()
		if err != nil {
			result.Outcome = Unknown
			result.Error = "视频提交响应未确认"
			return result
		}
		result.UpstreamStatus = status
		taskID := ""
		if command.ReadTaskID != nil {
			taskID = command.ReadTaskID(data)
		}
		if status >= 200 && status < 300 && taskID != "" {
			result.Outcome = Accepted
			result.TaskID = taskID
			result.Error = ""
			return result
		}
		rawMessage := upstreamMessage(data, status)
		if command.APIKey != "" {
			rawMessage = strings.ReplaceAll(rawMessage, command.APIKey, "[已隐藏]")
		}
		if status >= 200 && status < 300 && taskID == "" {
			rawMessage = "响应未返回任务 ID：" + rawMessage
		}
		result.Error = PresentVideoError(rawMessage)
		if status >= 200 && status < 300 || status >= 500 {
			result.Outcome = Unknown
			result.TaskID = taskID
			return result
		}
		if !CanTryAnotherEndpoint(status) && !(command.RetryOnMissingInput && missingVideoInput(rawMessage)) {
			result.Outcome = Rejected
			return result
		}
	}
	return result
}

func postJSON(ctx context.Context, client *http.Client, endpoint string, command SubmitCommand) (int, map[string]any, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(command.PayloadJSON))
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+command.APIKey)
	if strings.Contains(endpoint, "/video-generation/") || strings.Contains(endpoint, "/qwen/") {
		request.Header.Set("X-DashScope-Async", "enable")
	}
	for key, value := range command.Headers {
		request.Header.Set(key, value)
	}
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	data := map[string]any{}
	_ = json.Unmarshal(raw, &data)
	return response.StatusCode, data, nil
}

func missingVideoInput(message string) bool {
	lower := strings.ToLower(message)
	return strings.Contains(lower, "missing required parameter 'input'") || strings.Contains(lower, `missing required parameter "input"`)
}

func PresentVideoError(message string) string {
	return presentVideoError(message)
}

func presentVideoError(message string) string {
	detail := PresentUpstreamError(message)
	lower := strings.ToLower(detail)
	switch {
	case strings.Contains(lower, "missing required parameter 'input'") || strings.Contains(lower, `missing required parameter "input"`):
		return "万相官方请求未被接受：" + clipVideoError(detail)
	case strings.Contains(lower, "mode is not supported") || (strings.Contains(detail, "FieldInvalid") && strings.Contains(lower, "model")):
		return "该渠道不接受当前型号或参考方式：" + clipVideoError(detail)
	case strings.Contains(lower, "videourls[") && (strings.Contains(lower, "sensitive") || strings.Contains(detail, "敏感")):
		return "参考视频未通过安全检测（可能包含敏感画面或真人未报备素材），请更换合规的参考视频后重试：" + clipVideoError(detail)
	case strings.Contains(lower, "imageurls[") && (strings.Contains(lower, "sensitive") || strings.Contains(detail, "敏感")):
		return "参考图片未通过安全检测（可能包含敏感内容或违规画面），请更换参考图片后重试：" + clipVideoError(detail)
	case strings.Contains(lower, "sensitive content") || strings.Contains(detail, "包含敏感内容"):
		return "输入素材或提示词未通过安全检测，请更换素材或调整描述后重试：" + clipVideoError(detail)
	default:
		return clipVideoError(detail)
	}
}

func PresentUpstreamError(message string) string {
	return redactSignedMediaURLs(unwrapVideoError(strings.TrimSpace(message)))
}

func redactSignedMediaURLs(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.Contains(trimmed, "http://") && !strings.Contains(trimmed, "https://") {
		return trimmed
	}
	redacted := errorURLPattern.ReplaceAllStringFunc(trimmed, func(raw string) string {
		clean := strings.TrimRight(raw, ".,;:)]}")
		suffix := raw[len(clean):]
		label, signed := summarizeMediaURL(clean)
		if label == "" {
			return raw
		}
		if clean == trimmed && signed {
			return label + "处理失败（上游仅返回临时签名链接，请检查素材合规性或对象存储访问权限后重试）"
		}
		return label + suffix
	})
	return strings.TrimSpace(redacted)
}

func summarizeMediaURL(raw string) (string, bool) {
	lower := strings.ToLower(raw)
	signed := strings.Contains(lower, "x-oss-") || strings.Contains(lower, "x-amz-") || strings.Contains(lower, "signature=") || strings.Contains(lower, "q-sign-") || strings.Contains(lower, "/seedance/refs/")
	parsed, err := url.Parse(raw)
	pathPart := raw
	if err == nil && parsed.Path != "" {
		pathPart = parsed.Path
	} else if idx := strings.Index(pathPart, "?"); idx >= 0 {
		pathPart = pathPart[:idx]
	}
	base := path.Base(strings.TrimRight(pathPart, "/"))
	if decoded, err := url.PathUnescape(base); err == nil && strings.TrimSpace(decoded) != "" {
		base = strings.TrimSpace(decoded)
	}
	ext := strings.ToLower(path.Ext(base))
	isMediaExt := ext == ".mp4" || ext == ".mov" || ext == ".webm" || ext == ".m4v" || ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp"
	if !signed && !isMediaExt && len(raw) < 80 {
		return "", false
	}
	kind := "参考素材"
	if ext == ".mp4" || ext == ".mov" || ext == ".webm" || ext == ".m4v" {
		kind = "参考视频"
	} else if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" {
		kind = "参考图片"
	}
	if base != "" && base != "." && base != "/" && len([]rune(base)) <= 40 {
		return "【" + kind + "：" + base + "】", signed
	}
	return "【" + kind + "】", signed
}

func unwrapVideoError(message string) string {
	text := strings.TrimSpace(message)
	if start := strings.Index(text, "{"); start > 0 && strings.Contains(strings.ToLower(text[:start]), "failed") {
		text = strings.TrimSpace(text[start:])
	}
	if parsed := nestedVideoError(text); parsed != "" {
		return parsed
	}
	return text
}

func nestedVideoError(text string) string {
	var data map[string]any
	if json.Unmarshal([]byte(text), &data) != nil {
		return ""
	}
	for _, key := range []string{"message", "error", "fail_reason"} {
		switch value := data[key].(type) {
		case string:
			if strings.TrimSpace(value) == "" {
				continue
			}
			if inner := nestedVideoError(strings.TrimSpace(value)); inner != "" {
				return inner
			}
			return strings.TrimSpace(value)
		case map[string]any:
			if msg, ok := value["message"].(string); ok && strings.TrimSpace(msg) != "" {
				if inner := nestedVideoError(strings.TrimSpace(msg)); inner != "" {
					return inner
				}
				return strings.TrimSpace(msg)
			}
		}
	}
	if reason, ok := data["reason"].(string); ok && reason != "" {
		return reason
	}
	return ""
}

func clipVideoError(text string) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) > 180 {
		return string(runes[:180])
	}
	return text
}

func upstreamMessage(data map[string]any, status int) string {
	if data == nil {
		return "HTTP " + itoa(status)
	}
	for _, key := range []string{"message", "fail_reason"} {
		if text, ok := data[key].(string); ok && text != "" {
			return text
		}
	}
	if text, ok := data["error"].(string); ok && text != "" {
		return text
	}
	if nested, ok := data["error"].(map[string]any); ok {
		if message, ok := nested["message"].(string); ok && strings.TrimSpace(message) != "" {
			return message
		}
	}
	return "HTTP " + itoa(status)
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	negative := value < 0
	if negative {
		value = -value
	}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	if negative {
		return "-" + string(digits)
	}
	return string(digits)
}
