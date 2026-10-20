package generate

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

var errVideoSubmissionConflict = errors.New("该任务标识已用于其他视频参数，请查询原任务或使用新的标识")

type videoSubmission struct {
	recordID, key, taskID, status, result, reason, model, prompt, ratio, resolution string
	found, claimed                                                                  bool
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
		case "clientTaskId", "idempotencyKey", "customApiKey", "customBaseUrl":
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
			"size", "quality", "idempotencyKey", "createdAt", "updatedAt"
		) SELECT ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, 'video', ?, ?, ?, ?, ?
		WHERE NOT EXISTS (SELECT 1 FROM "ImageTask"
			WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "mediaType" = 'video')`,
		id, workspaceOf(r), emptyNull(product), adapted.payload["prompt"], "pending_"+nonce, adapted.modelID,
		adapted.ratio, adapted.resolution, key, now, now, workspaceOf(r), key)
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
	return row, err
}

func lookupVideoSubmission(cfg config.Config, r *http.Request, key string) (videoSubmission, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return videoSubmission{}, err
	}
	defer db.Close()
	return readVideoSubmission(r.Context(), db, workspaceOf(r), key)
}

func settleUnknownVideoTerminal(cfg config.Config, r *http.Request, taskID string, parsed pollParsed, usage string) {
	if imageTaskStillSubmitting(taskID) || (parsed.status != "SUCCESS" && parsed.status != "FAILURE") || (parsed.status == "SUCCESS" && parsed.result == "") {
		return
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	// Only an observed terminal result can resolve an uncertain submission. This
	// never submits generation, and cannot settle another workspace or media type.
	where := ` WHERE "workspaceId" = ? AND "taskId" = ? AND "mediaType" = 'video' AND "status" = 'SUBMISSION_UNKNOWN'`
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if usage != "" {
		_, err = db.ExecContext(r.Context(), `UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ?, "updatedAt" = ?, "usage" = ?`+where,
			parsed.status, emptyNull(parsed.result), emptyNull(parsed.reason), now, usage, workspaceOf(r), taskID)
		if err == nil {
			return
		}
	}
	_, _ = db.ExecContext(r.Context(), `UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ?, "updatedAt" = ?`+where,
		parsed.status, emptyNull(parsed.result), emptyNull(parsed.reason), now, workspaceOf(r), taskID)
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
