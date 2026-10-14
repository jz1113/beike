package modelgw

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
	Endpoints   []string
	APIKey      string
	PayloadJSON string
	Headers     map[string]string
	ReadTaskID  func(map[string]any) string
	Client      *http.Client
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
		result.Error = upstreamMessage(data, status)
		if status >= 200 && status < 300 || status >= 500 {
			result.Outcome = Unknown
			result.TaskID = taskID
			return result
		}
		if !CanTryAnotherEndpoint(status) {
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
