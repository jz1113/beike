package modelgw

import (
	"context"
	"net/http"
	"time"
)

// Modality identifies the generation or understanding medium.
type Modality string

const (
	ModalityImage      Modality = "image"
	ModalityVideo      Modality = "video"
	ModalityAudio      Modality = "audio"
	ModalityAvatar     Modality = "avatar"
	ModalityThreeD     Modality = "threed"
	ModalityMultimodal Modality = "multimodal"
)

// ModalityRequest encapsulates a unified request to any upstream model service.
type ModalityRequest struct {
	Modality    Modality
	Endpoints   []string
	APIKey      string
	PayloadJSON string
	Headers     map[string]string
	ReadTaskID  func(map[string]any) string
	Client      *http.Client
	Timeout     time.Duration
}

// DispatchModality handles multi-endpoint failover and outcome normalization.
func DispatchModality(ctx context.Context, req ModalityRequest) SubmitResult {
	client := req.Client
	if client == nil {
		client = &http.Client{}
	}
	result := SubmitResult{
		Outcome: Rejected,
		Error:   string(req.Modality) + " 接口未提供可用提交端点",
	}
	defaultTimeout := 30 * time.Second
	if req.Timeout > 0 {
		defaultTimeout = req.Timeout
	}
	for _, endpoint := range req.Endpoints {
		result.EndpointAttempts++
		result.UsedSubmitURL = endpoint
		timeout := defaultTimeout
		if result.EndpointAttempts == 1 && defaultTimeout < 60*time.Second {
			timeout = 60 * time.Second
		}
		attemptCtx, cancel := context.WithTimeout(ctx, timeout)
		status, data, err := postJSON(attemptCtx, client, endpoint, SubmitCommand{
			APIKey:      req.APIKey,
			PayloadJSON: req.PayloadJSON,
			Headers:     req.Headers,
		})
		cancel()
		if err != nil {
			result.Outcome = Unknown
			result.Error = string(req.Modality) + " 提交响应未确认"
			return result
		}
		result.UpstreamStatus = status
		taskID := ""
		if req.ReadTaskID != nil {
			taskID = req.ReadTaskID(data)
		}
		if status >= 200 && status < 300 && taskID != "" {
			result.Outcome = Accepted
			result.TaskID = taskID
			result.Error = ""
			return result
		}
		result.Error = upstreamMessage(data, status)
		if (status >= 200 && status < 300) || status >= 500 {
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
