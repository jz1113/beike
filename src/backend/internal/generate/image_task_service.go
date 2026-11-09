package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"reflect"
	"strings"
	"time"
)

// ImageTaskCheckpoint is safe to persist without model credentials. Callers must
// persist their idempotency key before calling RunImageTask for the first time.
type ImageTaskCheckpoint struct {
	Usage     map[string]any `json:"usage,omitempty"`
	Status    string         `json:"status,omitempty"`
	TaskID    string         `json:"taskId,omitempty"`
	RecordID  string         `json:"recordId,omitempty"`
	ResultURL string         `json:"resultUrl,omitempty"`
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
		mergeImageTaskCheckpoint(&checkpoint, body)
		checkpoint.TaskID, _ = body["taskId"].(string)
		checkpoint.ResultURL, _ = body["resultUrl"].(string)
		if checkpoint.TaskID != "" || checkpoint.ResultURL != "" || checkpoint.Usage != nil || checkpoint.RecordID != "" {
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
	// Older checkpoints retain the stable key even if they lost the record ID.
	if checkpoint.RecordID == "" {
		row, err := lookupImageTaskByKey(cfg, r, idempotencyKey)
		if err != nil {
			return checkpoint, &ImageTaskError{Message: "原生图记录暂时无法核对，请稍后恢复", SubmissionUnknown: true}
		}
		if row.found {
			if row.taskID != checkpoint.TaskID {
				return checkpoint, &ImageTaskError{Message: "原任务记录与任务编号不一致，已停止恢复", SubmissionUnknown: true}
			}
			checkpoint.RecordID = row.recordID
			if onCheckpoint != nil {
				if err := onCheckpoint(checkpoint); err != nil {
					return checkpoint, err
				}
			}
		}
	}
	if checkpoint.RecordID != "" {
		r.Header.Set("x-task-record-id", checkpoint.RecordID)
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
		if mergeImageTaskCheckpoint(&checkpoint, body) && onCheckpoint != nil {
			if err := onCheckpoint(checkpoint); err != nil {
				return checkpoint, err
			}
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

type imageClaim struct {
	recordID, key string
	reused        bool
	row           keyedImageTask
}

func imageSubmissionFingerprint(r *http.Request, payload map[string]json.RawMessage, model, prompt, quality, size string) string {
	request := map[string]any{}
	for key, raw := range payload {
		switch key {
		case "customApiKey", "storageConfig", "clientTaskId", "idempotencyKey":
			continue
		}
		var value any
		_ = json.Unmarshal(raw, &value)
		request[key] = value
	}
	encoded, _ := json.Marshal(map[string]any{
		"request": request, "model": model, "prompt": prompt, "quality": quality, "size": size,
		"baseHeader": r.Header.Get("x-custom-base-url"), "protocolHeader": r.Header.Get("x-custom-protocol"),
		"templateHeader": r.Header.Get("x-request-template"),
	})
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func claimImageSubmission(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model, prompt, quality, size, idempotencyKey string) (imageClaim, int, string) {
	key := strings.TrimSpace(idempotencyKey)
	if len(key) > 256 {
		return imageClaim{}, http.StatusBadRequest, "任务标识无效"
	}
	nonce, err := randomTaskID()
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	if key == "" {
		key = nonce
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	defer db.Close()
	fingerprint := imageSubmissionFingerprint(r, payload, model, prompt, quality, size)
	id := "image_" + nonce + "_" + fingerprint
	product := rawString(payload, "productId")
	if product != "" && !productExists(r.Context(), db, product) {
		product = ""
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	// A single SQLite write serializes the existence check and claim across
	// connections/processes. Existing receipts, including unknown ones, block
	// resubmission. No unique-index migration or deletion of old duplicates.
	result, err := db.ExecContext(r.Context(), `INSERT INTO "ImageTask" (
		"id","workspaceId","productId","prompt","taskId","status","model","mediaType",
		"size","quality","idempotencyKey","createdAt","updatedAt","routeFingerprint")
		SELECT ?,?,?,?,?,'IN_PROGRESS',?,'image',?,?,?,?,?,?
		WHERE NOT EXISTS (SELECT 1 FROM "ImageTask" WHERE "workspaceId" = ? AND "idempotencyKey" = ?
			AND COALESCE(NULLIF("mediaType", ''), 'image') = 'image')`,
		id, workspaceOf(r), emptyNull(product), prompt, "pending_"+nonce, model, size, quality, key, now, now, imageSubmissionRoute(cfg, r, payload, model), workspaceOf(r), key)
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	count, err := result.RowsAffected()
	if err != nil {
		return imageClaim{}, http.StatusInternalServerError, "任务持久化失败: " + err.Error()
	}
	row, err := readImageSubmission(r.Context(), db, workspaceOf(r), key)
	if err != nil || !row.found {
		return imageClaim{}, http.StatusServiceUnavailable, "原任务提交记录暂时无法核对，请查询原任务；不会自动重新提交"
	}
	if strings.HasPrefix(row.recordID, "image_") && !strings.HasSuffix(row.recordID, "_"+fingerprint) {
		return imageClaim{}, http.StatusConflict, "该任务标识已用于其他生图参数，请查询原任务或使用新的标识"
	}
	return imageClaim{recordID: row.recordID, key: key, reused: count == 0, row: row}, 0, ""
}

func reusedImageSubmission(claim imageClaim) (int, map[string]any) {
	row := claim.row
	body := map[string]any{"success": true, "reused": true, "recordId": row.recordID, "taskKey": claim.key, "status": row.status, "resultUrl": row.result, "failReason": row.reason}
	putStoredUsage(body, row.usage)
	if !imageTaskStillSubmitting(row.taskID) {
		body["taskId"] = row.taskID
	}
	if row.status == "SUCCESS" && row.result != "" {
		return http.StatusOK, body
	}
	if row.status == "FAILURE" {
		body["success"], body["submissionRejected"], body["error"] = false, true, row.reason
		return http.StatusBadRequest, body
	}
	if row.status == "SUBMISSION_UNKNOWN" || imageTaskStillSubmitting(row.taskID) {
		body["success"], body["submissionUnknown"], body["submissionOutcome"], body["retryable"] = false, true, "unknown", false
		body["submissionPending"] = row.status != "SUBMISSION_UNKNOWN"
		body["error"] = "原生图提交结果待核实，请查询原任务；不会自动重新提交"
		return http.StatusServiceUnavailable, body
	}
	return http.StatusOK, body
}

// Provider usage is cumulative, including when the task failed or was interrupted.
func mergeImageTaskCheckpoint(checkpoint *ImageTaskCheckpoint, body map[string]any) bool {
	previous := *checkpoint
	if id, _ := body["recordId"].(string); id != "" {
		checkpoint.RecordID = id
	}
	if usage := gateway.NormalizeUsage(body); usage != nil {
		for _, field := range []string{"promptTokens", "completionTokens", "totalTokens"} {
			if old, ok := checkpoint.Usage[field].(float64); ok {
				usage[field] = math.Max(old, usage[field].(float64))
			}
		}
		usage["totalTokens"] = math.Max(usage["totalTokens"].(float64), usage["promptTokens"].(float64)+usage["completionTokens"].(float64))
		checkpoint.Usage = usage
	}
	if status, _ := body["status"].(string); status != "" && checkpoint.Status != "SUCCESS" {
		checkpoint.Status = status
	}
	if checkpoint.Status == "SUCCESS" && body["submissionUnknown"] != true && body["success"] != false {
		if result, _ := body["resultUrl"].(string); result != "" {
			checkpoint.ResultURL = result
		}
	}
	return !reflect.DeepEqual(previous, *checkpoint)
}

// Store only a digest, never a credential. A changed route must not send a
// previously submitted task ID to another provider/account after reload.
func imageRouteFingerprint(base, key, protocol string, template json.RawMessage) string {
	protocolID := resolveImageProtocol(base, protocol).ID()
	var templateValue any
	if protocolID == "template" {
		_ = json.Unmarshal(template, &templateValue)
	}
	// Marshal the parsed template so whitespace and JSON key ordering do not
	// invalidate the same route, but a changed poll URL/header/body does.
	encoded, _ := json.Marshal([]any{gateway.NormalizeGatewayBaseURL(base), key, protocolID, templateValue})
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func imageSubmissionRoute(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, model string) string {
	base, key := imageSubmitCredentials(cfg, r, payload, model)
	return imageRouteFingerprint(base, key, imageProtocolName(payload, r.Header.Get("x-custom-protocol")), imageRequestTemplate(payload))
}

func authorizeImageRoute(cfg config.Config, w http.ResponseWriter, r *http.Request, taskID string) bool {
	requireRoute := r.URL.Query().Get("requireRoute") == "true"
	db, err := openTaskDB(cfg)
	if err != nil {
		if !requireRoute && !cfg.Production() && workspaceOf(r) == "local" {
			return true
		}
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "原任务渠道暂时无法核对，请稍后重试"})
		return false
	}
	defer db.Close()
	var fingerprint string
	err = db.QueryRowContext(r.Context(), `SELECT "routeFingerprint" FROM "ImageTask"
  WHERE "workspaceId" = ? AND COALESCE(NULLIF("mediaType", ''), 'image') = 'image' AND "taskId" = ? AND (?='' OR "id"=?) LIMIT 1`, workspaceOf(r), taskID, r.Header.Get("x-task-record-id"), r.Header.Get("x-task-record-id")).Scan(&fingerprint)
	if err == sql.ErrNoRows || (err == nil && fingerprint == "") {
		if !requireRoute {
			return true // Legacy callers retain their existing recovery behavior.
		}
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{
			"success": false, "code": "task_route_unavailable", "submissionUnknown": true,
			"error": "旧画布图片任务缺少可验证的渠道记录，请在原渠道核对；不会猜测渠道或重新生成",
		})
		return false
	}
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "原任务渠道暂时无法核对，请稍后重试"})
		return false
	}
	base, key := pollCredentials(cfg, r)
	template := imageTemplateForPoll(base, taskID, r.Header.Get("x-request-template"))
	if fingerprint == imageRouteFingerprint(base, key, r.Header.Get("x-custom-protocol"), template) {
		return true
	}
	httpx.WriteJSON(w, http.StatusConflict, map[string]any{
		"success": false, "code": "task_route_changed", "submissionUnknown": true,
		"error": "当前渠道或密钥与原生图任务不一致，请恢复原渠道配置后核对；不会向其他渠道查询或重新生成",
	})
	return false
}
