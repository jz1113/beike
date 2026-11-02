package generate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

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
		"size","quality","idempotencyKey","createdAt","updatedAt")
		SELECT ?,?,?,?,?,'IN_PROGRESS',?,'image',?,?,?,?,?
		WHERE NOT EXISTS (SELECT 1 FROM "ImageTask" WHERE "workspaceId" = ? AND "idempotencyKey" = ?
			AND COALESCE(NULLIF("mediaType", ''), 'image') = 'image')`,
		id, workspaceOf(r), emptyNull(product), prompt, "pending_"+nonce, model, size, quality, key, now, now, workspaceOf(r), key)
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
