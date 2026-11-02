package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

// ImageTaskCheckpoint is safe to persist without model credentials. Callers must
// persist their idempotency key before calling RunImageTask for the first time.
type ImageTaskCheckpoint struct {
	TaskID    string `json:"taskId,omitempty"`
	ResultURL string `json:"resultUrl,omitempty"`
}

// ImageTaskError retains whether a submission may have reached the provider.
// An unknown submission must be reconciled using its existing key, never retried
// with a new key automatically.
type ImageTaskError struct {
	Message            string
	SubmissionUnknown  bool
	SubmissionRejected bool
}

func (err *ImageTaskError) Error() string { return err.Message }

// RunImageTask uses the same validation, submission receipts, protocol adapters,
// ownership checks and terminal-result persistence as the public image API.
// r carries the workspace context and model credential headers. A background
// worker should pass its own context rather than a browser request's context.
// A checkpoint callback error stops the operation and returns the newest state.
func RunImageTask(cfg config.Config, r *http.Request, payload map[string]any, idempotencyKey string, checkpoint ImageTaskCheckpoint, onCheckpoint func(ImageTaskCheckpoint) error) (ImageTaskCheckpoint, error) {
	if r == nil {
		return checkpoint, errors.New("生图任务缺少请求上下文")
	}
	if err := r.Context().Err(); err != nil {
		return checkpoint, err
	}
	if checkpoint.ResultURL != "" {
		return checkpoint, nil
	}
	if strings.TrimSpace(idempotencyKey) == "" || len(idempotencyKey) > 256 {
		return checkpoint, errors.New("生图任务需要有效的幂等标识")
	}
	if checkpoint.TaskID != "" && imageTaskStillSubmitting(checkpoint.TaskID) {
		return checkpoint, &ImageTaskError{Message: "生图提交结果待核实，请查询原任务；不会自动重新提交", SubmissionUnknown: true}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return checkpoint, errors.New("生图任务参数无效")
	}
	var raw map[string]json.RawMessage
	if json.Unmarshal(encoded, &raw) != nil || raw == nil {
		return checkpoint, errors.New("生图任务参数无效")
	}
	ctx := r.Context()
	if _, bounded := ctx.Deadline(); !bounded {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 20*time.Minute)
		defer cancel()
	}
	r = r.Clone(ctx)
	if checkpoint.TaskID == "" {
		if status, body := imagePayloadError(cfg, r, raw); status != 0 {
			return checkpoint, imageTaskServiceError(body, "生图参数无效")
		}
		status, body := executeImageSubmission(cfg, r, raw, idempotencyKey)
		// Persist even an upstream task ID returned with a receipt-storage error.
		// Unknown submissions cannot be polled until ownership has been recorded.
		checkpoint.TaskID, _ = body["taskId"].(string)
		checkpoint.ResultURL, _ = body["resultUrl"].(string)
		if checkpoint.TaskID != "" || checkpoint.ResultURL != "" {
			if onCheckpoint != nil {
				if err := onCheckpoint(checkpoint); err != nil {
					return checkpoint, err
				}
			}
		}
		if status < 200 || status >= 300 || body["success"] == false || body["submissionUnknown"] == true {
			return checkpoint, imageTaskServiceError(body, "生图提交失败")
		}
		if checkpoint.ResultURL != "" {
			return checkpoint, nil
		}
		if checkpoint.TaskID == "" || imageTaskStillSubmitting(checkpoint.TaskID) {
			return checkpoint, &ImageTaskError{Message: "生图提交结果待核实，请查询原任务；不会自动重新提交", SubmissionUnknown: true}
		}
	}
	// Polling reads credentials/protocol/template from headers, whereas submission
	// accepts both headers and body fields. Normalize only this cloned request.
	for field, header := range map[string]string{"customBaseUrl": "x-custom-base-url", "customApiKey": "x-custom-api-key", "customProtocol": "x-custom-protocol"} {
		if value := rawString(raw, field); value != "" {
			r.Header.Set(header, value)
		}
	}
	if template := imageRequestTemplate(raw); len(template) > 0 {
		r.Header.Set("x-request-template", string(template))
	}
	query := r.URL.Query()
	model := rawString(raw, "model")
	if model == "" {
		model = "gpt-image-2"
	}
	query.Set("model", model)
	r.URL.RawQuery = query.Encode()
	for {
		if err := ctx.Err(); err != nil {
			return checkpoint, err
		}
		response := &imageTaskResponse{header: make(http.Header)}
		if strings.HasPrefix(checkpoint.TaskID, "direct_") {
			writeDirectImagePoll(cfg, response, r, checkpoint.TaskID)
		} else {
			pollImageTask(cfg, response, r, checkpoint.TaskID)
		}
		var body map[string]any
		if json.Unmarshal(response.body.Bytes(), &body) != nil {
			return checkpoint, errors.New("生图任务状态格式无效")
		}
		if body["submissionUnknown"] == true {
			return checkpoint, imageTaskServiceError(body, "生图提交结果待核实")
		}
		if response.status >= 400 && response.status < 500 && response.status != http.StatusTooManyRequests {
			return checkpoint, imageTaskServiceError(body, "生图任务查询失败")
		}
		if body["status"] == "FAILURE" {
			return checkpoint, imageTaskServiceError(body, "生图任务失败")
		}
		if body["status"] == "SUCCESS" {
			checkpoint.ResultURL, _ = body["resultUrl"].(string)
			if checkpoint.ResultURL == "" {
				return checkpoint, errors.New("生图任务未返回结果图")
			}
			if onCheckpoint != nil {
				if err := onCheckpoint(checkpoint); err != nil {
					return checkpoint, err
				}
			}
			return checkpoint, nil
		}
		timer := time.NewTimer(2 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return checkpoint, ctx.Err()
		case <-timer.C:
		}
	}
}

func imageTaskServiceError(body map[string]any, fallback string) error {
	message, _ := body["error"].(string)
	if message == "" {
		message, _ = body["failReason"].(string)
	}
	if message == "" {
		message = fallback
	}
	return &ImageTaskError{Message: message, SubmissionUnknown: body["submissionUnknown"] == true, SubmissionRejected: body["submissionRejected"] == true}
}

type imageTaskResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *imageTaskResponse) Header() http.Header { return w.header }
func (w *imageTaskResponse) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}
func (w *imageTaskResponse) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.body.Write(data)
}
