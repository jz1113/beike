package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var errVideoSubmissionConflict = errors.New("该任务标识已用于其他视频参数，请查询原任务或使用新的标识")

type videoSubmission struct {
	usage                                                                           string
	recordID, key, taskID, status, result, reason, model, prompt, ratio, resolution string
	found, claimed                                                                  bool
	diagnostics                                                                     *videoSubmissionDiagnostics
}

func videoSubmissionKey(r *http.Request, payload map[string]json.RawMessage) (string, error) {
	key := ""
	for _, value := range []string{r.Header.Get("x-idempotency-key"), rawString(payload, "clientTaskId"), rawString(payload, "idempotencyKey")} {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if len(value) > 256 {
			return "", errors.New("任务标识无效")
		}
		if key != "" && key != value {
			return "", errors.New("客户端任务标识与幂等标识不一致")
		}
		key = value
	}
	if key == "" {
		// Legacy callers receive a generated receipt key, but are never submitted
		// until that receipt has been durably recorded too.
		return randomTaskID()
	}
	return key, nil
}

func videoSubmissionFingerprint(base string, payload map[string]json.RawMessage, adapted videoAdapted) string {
	request := map[string]any{}
	for key, raw := range payload {
		switch key {
		case "clientTaskId", "idempotencyKey", "customApiKey", "customBaseUrl", "storageConfig":
			continue
		}
		var value any
		_ = json.Unmarshal(raw, &value)
		request[key] = value
	}
	for key, value := range adapted.payload {
		request[key] = value
	}
	encoded, _ := json.Marshal(map[string]any{"base": strings.TrimRight(base, "/"), "request": request})
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func claimVideoSubmission(cfg config.Config, r *http.Request, payload map[string]json.RawMessage, adapted videoAdapted, base, key string) (videoSubmission, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return videoSubmission{}, err
	}
	defer db.Close()
	nonce, err := randomTaskID()
	if err != nil {
		return videoSubmission{}, err
	}
	prompt := strings.TrimSpace(rawString(payload, "prompt"))
	if prompt == "" {
		return videoSubmission{}, errors.New("视频提示词不能为空")
	}
	fingerprint := videoSubmissionFingerprint(base, payload, adapted)
	// Keep the request fingerprint in the immutable record ID. Terminal polling
	// can then update failReason/resultUrl without losing conflict detection.
	id := "video_" + nonce + "_" + fingerprint
	product := rawString(payload, "productId")
	if product != "" && !productExists(r.Context(), db, product) {
		product = ""
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	// SQLite serializes this single write statement across connections/processes.
	// The existence check and insertion are atomic, without a schema migration or
	// changing image submissions' existing idempotency behavior.
	result, err := db.ExecContext(r.Context(), `
		INSERT INTO "ImageTask" (
			"id", "workspaceId", "productId", "prompt", "taskId", "status", "model", "mediaType",
			"size", "quality", "idempotencyKey", "createdAt", "updatedAt", "routeFingerprint"
		) SELECT ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, 'video', ?, ?, ?, ?, ?, ?
		WHERE NOT EXISTS (SELECT 1 FROM "ImageTask"
			WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'video')`,
		id, workspaceOf(r), emptyNull(product), prompt, "pending_"+nonce, adapted.modelID,
		adapted.ratio, adapted.resolution, key, now, now, videoSubmissionRoute(cfg, r, payload, adapted.modelID, ""), workspaceOf(r), key)
	if err != nil {
		return videoSubmission{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return videoSubmission{}, err
	}
	row, err := readVideoSubmission(r.Context(), db, workspaceOf(r), key)
	if err != nil {
		return row, err
	}
	if !row.found {
		return row, errors.New("视频提交回执未找到")
	}
	if !strings.HasPrefix(row.recordID, "video_") || !strings.HasSuffix(row.recordID, "_"+fingerprint) {
		return row, errVideoSubmissionConflict
	}
	row.claimed = count == 1
	return row, nil
}

func readVideoSubmission(ctx context.Context, db *sql.DB, workspace, key string) (videoSubmission, error) {
	row := videoSubmission{key: key}
	err := db.QueryRowContext(ctx, `
		SELECT "id", COALESCE("taskId", ''), "status", COALESCE("resultUrl", ''), COALESCE("failReason", ''),
			COALESCE("model", ''), "prompt", COALESCE("size", ''), COALESCE("quality", '')
		FROM "ImageTask" WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'video'
		ORDER BY "createdAt" DESC LIMIT 1`, workspace, key).Scan(
		&row.recordID, &row.taskID, &row.status, &row.result, &row.reason, &row.model, &row.prompt, &row.ratio, &row.resolution)
	if err == sql.ErrNoRows {
		return row, nil
	}
	row.found = err == nil
	if row.found {
		row.usage = readTaskUsage(ctx, db, taskScope{workspace: workspace, media: "video", recordID: row.recordID}, row.taskID)
	}
	return row, err
}

func lookupVideoSubmission(cfg config.Config, r *http.Request, key string) (videoSubmission, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return videoSubmission{}, err
	}
	defer db.Close()
	row, err := readVideoSubmission(r.Context(), db, workspaceOf(r), key)
	if err == nil && row.found {
		row.diagnostics = readVideoSubmissionDiagnostics(cfg, workspaceOf(r), row.recordID)
	}
	return row, err
}

func settleUnknownVideoTerminal(cfg config.Config, r *http.Request, taskID string, parsed pollParsed, usage string) {
	if imageTaskStillSubmitting(taskID) || (parsed.status != "SUCCESS" && parsed.status != "FAILURE") || (parsed.status == "SUCCESS" && parsed.result == "") {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	scope := scopeOf(r, "video")
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	// Only an observed terminal result can resolve an uncertain submission. This
	// never submits generation, and cannot settle another workspace or media type.
	where := ` WHERE ` + taskScopeWhere + ` AND "status" = 'SUBMISSION_UNKNOWN'`
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if observed := gateway.DecodeUsage(usage); observed != nil {
		_, _ = mergeTaskUsage(ctx, db, scope, taskID, observed)
	}

	_, _ = db.ExecContext(ctx, `UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ?, "updatedAt" = ?`+where,
		parsed.status, emptyNull(parsed.result), emptyNull(parsed.reason), now, scope.workspace, scope.media, taskID, scope.recordID, scope.recordID)
}

func settleVideoSubmission(cfg config.Config, r *http.Request, recordID string, patch imageTaskDraft) error {
	// Persist the upstream receipt even if the caller disconnects after being charged.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	db, err := openTaskDB(cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	return settleImageSubmission(ctx, db, recordID, patch)
}

// Atomically fence a missing intent against a delayed POST. Existing receipts,
// including uncertain paid submissions, always win and remain untouched.
func closeMissingVideoSubmission(cfg config.Config, r *http.Request, key string) (videoSubmission, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return videoSubmission{}, err
	}
	defer db.Close()
	nonce, err := randomTaskID()
	if err != nil {
		return videoSubmission{}, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err = db.ExecContext(r.Context(), `INSERT INTO "ImageTask"
 ("id", "workspaceId", "prompt", "taskId", "status", "mediaType", "idempotencyKey", "failReason", "createdAt", "updatedAt")
 SELECT ?, ?, '', ?, 'FAILURE', 'video', ?, ?, ?, ?
 WHERE NOT EXISTS (SELECT 1 FROM "ImageTask" WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'video')`,
		"closed_"+nonce, workspaceOf(r), "pending_"+nonce, key, "上次视频未提交，原任务标识已关闭；可重新生成", now, now, workspaceOf(r), key)
	if err != nil {
		return videoSubmission{}, err
	}
	return readVideoSubmission(r.Context(), db, workspaceOf(r), key)
}

func videoSubmissionBody(row videoSubmission) map[string]any {
	body := map[string]any{
		"success": true, "taskKey": row.key, "recordId": row.recordID, "model": row.model,
		"prompt": row.prompt, "aspect_ratio": row.ratio, "resolution": row.resolution,
		"status": row.status, "retryable": false,
	}
	putStoredUsage(body, row.usage)
	if row.diagnostics != nil {
		body["submissionDiagnostics"] = row.diagnostics
		body["diagnosticsSaved"] = row.diagnostics.SubmissionOutcome != "prepared"
	}
	pending := imageTaskStillSubmitting(row.taskID)
	if !pending {
		body["taskId"] = row.taskID
	}
	switch {
	case row.status == "FAILURE" && pending:
		body["success"] = false
		body["submissionOutcome"] = "rejected"
		body["submissionRejected"] = true
		body["error"] = row.reason
		body["failReason"] = row.reason
	case row.status == "SUBMISSION_UNKNOWN" || pending:
		body["success"] = false
		body["status"] = "QUERY_FAILED"
		body["submissionOutcome"] = "unknown"
		body["submissionUnknown"] = true
		body["submissionPending"] = row.status != "SUBMISSION_UNKNOWN"
		body["error"] = row.reason
		if row.reason == "" {
			body["error"] = "原视频提交结果待核实，请查询原任务；不会自动重新提交"
		}
	default:
		body["submissionOutcome"] = "accepted"
		body["resultUrl"] = row.result
		body["failReason"] = row.reason
	}
	return body
}

func writeVideoSubmission(w http.ResponseWriter, row videoSubmission, reused bool) {
	body := videoSubmissionBody(row)
	body["reused"] = reused
	status := http.StatusOK
	if body["submissionOutcome"] == "rejected" {
		status = http.StatusBadRequest
	} else if body["submissionOutcome"] == "unknown" {
		status = http.StatusServiceUnavailable
	}
	httpx.WriteJSON(w, status, body)
}

func pollVideoSubmission(cfg config.Config, w http.ResponseWriter, r *http.Request, key string) {
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 256 {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"})
		return
	}
	row, err := lookupVideoSubmission(cfg, r, key)
	if err == nil && !row.found && r.URL.Query().Get("closeMissing") == "true" {
		row, err = closeMissingVideoSubmission(cfg, r, key)
	}
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
			"success": false, "status": "QUERY_FAILED", "taskKey": key, "retryable": false,
			"submissionUnknown": true, "error": "原视频提交记录暂时无法核对，请稍后查询；不会自动重新提交",
		})
		return
	}
	if !row.found {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": false, "status": "QUERY_FAILED", "taskKey": key, "retryable": false,
			"submissionUnknown": true, "error": "尚未找到原视频提交记录，请稍后核对；不会自动重新提交",
		})
		return
	}
	// The receipt exposes the original upstream ID without depending on upstream
	// availability or credentials. The existing taskId GET continues polling it.
	httpx.WriteJSON(w, http.StatusOK, videoSubmissionBody(row))
}

var videoDiagnosticURL = regexp.MustCompile(`(?i)(?:https?://|data:)[^\s"<>]+`)
var videoDiagnosticSecret = regexp.MustCompile(`(?i)(?:bearer\s+|(?:api[_-]?key|token|authorization|secret)\s*[=:]\s*)[^\s,;"}]+`)

func safeVideoSubmitReason(message, key string, status, attempts int) string {
	if key != "" {
		message = strings.ReplaceAll(message, key, "[已隐藏]")
	}
	message = videoDiagnosticURL.ReplaceAllString(message, "[地址已隐藏]")
	message = videoDiagnosticSecret.ReplaceAllString(message, "[凭据已隐藏]")
	text := []rune(strings.TrimSpace(message))
	if len(text) > 240 {
		text = text[:240]
	}
	stage := "网络或响应读取阶段"
	if status > 0 {
		stage = fmt.Sprintf("上游 HTTP %d", status)
	}
	return fmt.Sprintf("%s（%s，尝试 %d 个端点）", string(text), stage, attempts)
}
