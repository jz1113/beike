package gateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

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
			timeout = 60 * time.Second
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
		result.Error = presentVideoError(rawMessage)
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

func presentVideoError(message string) string {
	detail := unwrapVideoError(strings.TrimSpace(message))
	lower := strings.ToLower(detail)
	switch {
	case strings.Contains(lower, "missing required parameter 'input'") || strings.Contains(lower, `missing required parameter "input"`):
		return "万相官方请求未被接受：" + clipVideoError(detail)
	case strings.Contains(lower, "mode is not supported") || (strings.Contains(detail, "FieldInvalid") && strings.Contains(lower, "model")):
		return "该渠道不接受当前型号或参考方式：" + clipVideoError(detail)
	default:
		return clipVideoError(detail)
	}
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
		value, ok := data[key].(string)
		if !ok || value == "" {
			continue
		}
		if inner := nestedVideoError(strings.TrimSpace(value)); inner != "" {
			return inner
		}
		return value
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
