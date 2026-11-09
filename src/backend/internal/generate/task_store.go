package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/submission"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"
)

type imageTaskDraft struct {
	ProductID        string
	Prompt           string
	TaskID           string
	Model            string
	Size             string
	Quality          string
	ResultURL        string
	Status           string
	MediaType        string
	IdempotencyKey   string
	FailReason       string
	RouteFingerprint string
}

func openTaskDB(cfg config.Config) (*sql.DB, error) {
	return database.OpenRequired(cfg.SQLiteFile())
}

func settleImageSubmission(ctx context.Context, db *sql.DB, recordID string, patch imageTaskDraft) error {
	if recordID == "" {
		return nil
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := db.ExecContext(ctx, `
		UPDATE "ImageTask" SET
			"taskId" = CASE WHEN ? != '' THEN ? ELSE "taskId" END,
			"status" = CASE WHEN ? != '' THEN ? ELSE "status" END,
			"resultUrl" = CASE WHEN ? != '' THEN ? ELSE "resultUrl" END,
			"failReason" = ?,
			"model" = CASE WHEN ? != '' THEN ? ELSE "model" END,
			"prompt" = CASE WHEN ? != '' THEN ? ELSE "prompt" END,
			"size" = CASE WHEN ? != '' THEN ? ELSE "size" END,
			"routeFingerprint" = CASE WHEN ? != '' THEN ? ELSE "routeFingerprint" END,
			"updatedAt" = ?
		WHERE "id" = ?`,
		patch.TaskID, patch.TaskID,
		patch.Status, patch.Status,
		patch.ResultURL, patch.ResultURL,
		emptyNull(patch.FailReason),
		patch.Model, patch.Model,
		patch.Prompt, patch.Prompt,
		patch.Size, patch.Size,
		patch.RouteFingerprint, patch.RouteFingerprint,
		now, recordID)
	return err
}

func insertImageTask(ctx context.Context, db *sql.DB, workspace string, draft imageTaskDraft) (string, error) {
	id, err := randomTaskID()
	if err != nil {
		return "", err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	product := draft.ProductID
	if product != "" && !productExists(ctx, db, product) {
		product = ""
	}
	var productValue any
	if product != "" {
		productValue = product
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO "ImageTask" (
			"id", "workspaceId", "productId", "prompt", "taskId", "status", "resultUrl", "failReason",
			"model", "mediaType", "size", "quality", "idempotencyKey", "createdAt", "updatedAt"
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspace, productValue, draft.Prompt, draft.TaskID, draft.Status, emptyNull(draft.ResultURL), emptyNull(draft.FailReason),
		draft.Model, draft.MediaType, draft.Size, draft.Quality, emptyNull(draft.IdempotencyKey), now, now)
	return id, err
}

func productExists(ctx context.Context, db *sql.DB, id string) bool {
	var found string
	err := db.QueryRowContext(ctx, `SELECT "id" FROM "Product" WHERE "id" = ? LIMIT 1`, id).Scan(&found)
	return err == nil && found != ""
}

func taskStatus(ctx context.Context, db *sql.DB, scope taskScope, taskID string) (status, result, reason, usage string, ok bool, err error) {
	var state, url, fail sql.NullString
	err = db.QueryRowContext(ctx, `SELECT "status", "resultUrl", "failReason" FROM "ImageTask" WHERE `+taskScopeWhere+` LIMIT 1`, scope.workspace, scope.media, taskID, scope.recordID, scope.recordID).
		Scan(&state, &url, &fail)
	if err == sql.ErrNoRows {
		return "", "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", "", false, err
	}
	return state.String, url.String, fail.String, readTaskUsage(ctx, db, scope, taskID), true, nil
}

func updateTaskTerminal(ctx context.Context, db *sql.DB, scope taskScope, taskID, status, result, reason, usageJSON string) {
	if usage := gateway.DecodeUsage(usageJSON); usage != nil {
		_, _ = mergeTaskUsage(ctx, db, scope, taskID, usage)
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	recoverFailure := status == "SUCCESS" && result != ""
	_, _ = db.ExecContext(ctx, `UPDATE "ImageTask" SET "status"=?,"resultUrl"=?,"failReason"=?,"updatedAt"=?
 WHERE `+taskScopeWhere+` AND ("status" IN ('PENDING','IN_PROGRESS','SUBMISSION_UNKNOWN') OR ("status"='FAILURE' AND ?))`,
		status, emptyNull(result), emptyNull(reason), now, scope.workspace, scope.media, taskID, scope.recordID, scope.recordID, recoverFailure)
}

func putStoredUsage(body map[string]any, raw string) {
	if usage := gateway.DecodeUsage(raw); usage != nil {
		body["usage"] = usage
	}
}

func randomTaskID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func emptyNull(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func workspaceOf(r *http.Request) string { return httpx.WorkspaceFrom(r) }

// The same SQLite write lock serializes closure with the original POST's claim.
// A pre-existing claim always wins, including an uncertain paid submission.
func closeMissingImageSubmission(cfg config.Config, r *http.Request, key string) (keyedImageTask, error) {
	db, err := openTaskDB(cfg)
	if err != nil {
		return keyedImageTask{}, err
	}
	defer db.Close()
	nonce, err := randomTaskID()
	if err != nil {
		return keyedImageTask{}, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err = db.ExecContext(r.Context(), `INSERT INTO "ImageTask"
 ("id","workspaceId","prompt","taskId","status","mediaType","idempotencyKey","failReason","createdAt","updatedAt")
 SELECT ?,?,'',?,'FAILURE','image',?,?,?,?
 WHERE NOT EXISTS (SELECT 1 FROM "ImageTask" WHERE "workspaceId"=? AND "idempotencyKey"=? AND COALESCE(NULLIF("mediaType",''),'image')='image')`,
		"closed_"+nonce, workspaceOf(r), "pending_"+nonce, key, "上次图片未提交，原操作标识已关闭；可重新生成", now, now, workspaceOf(r), key)
	if err != nil {
		return keyedImageTask{}, err
	}
	return readImageSubmission(r.Context(), db, workspaceOf(r), key)
}

// Legacy audio tasks live in ImageTask, while new POSTs claim GenerationSubmission.
// Check both stores in one INSERT; neither existing representation may be closed.
func closeMissingAudioSubmission(cfg config.Config, r *http.Request, key string) error {
	db, err := openTaskDB(cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	nonce := submission.NewKey()
	if nonce == "" {
		return errors.New("cannot allocate closure identity")
	}
	body, _ := json.Marshal(map[string]any{"success": false, "status": "FAILURE", "submissionRejected": true, "submissionClosed": true,
		"failReason": "上次音频未提交，原操作标识已关闭；可重新生成"})
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = db.ExecContext(r.Context(), `INSERT INTO "GenerationSubmission"
 ("id","workspaceId","kind","operationKey","fingerprint","httpStatus","response","createdAt","updatedAt")
 SELECT ?,?,'audio',?,'closed',200,?,?,?
 WHERE NOT EXISTS (SELECT 1 FROM "ImageTask" WHERE "workspaceId"=? AND "idempotencyKey"=? AND "mediaType"='audio')
 ON CONFLICT("workspaceId","kind","operationKey") DO NOTHING`,
		"closed_"+nonce, workspaceOf(r), key, string(body), now, now, workspaceOf(r), key)
	return err
}

func attachUsage(body, source map[string]any) {
	if usage := gateway.NormalizeUsage(source); usage != nil {
		body["usage"] = usage
	}
}

type taskScope struct {
	workspace, media, recordID string
}

func scopeOf(r *http.Request, media string) taskScope {
	return taskScope{workspace: workspaceOf(r), media: media, recordID: strings.TrimSpace(r.Header.Get("x-task-record-id"))}
}

// Hosted polling must prove ownership before returning a receipt or contacting
// upstream. Local-only legacy clients may still query unrecorded upstream IDs;
// an ID recorded for a different workspace/media never gets that fallback.
func authorizeTaskPoll(cfg config.Config, w http.ResponseWriter, r *http.Request, media, taskID string) bool {
	db, err := openTaskDB(cfg)
	if err != nil {
		if !cfg.Production() && workspaceOf(r) == "local" {
			return true
		}
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "查询任务状态失败，请稍后重试"})
		return false
	}
	defer db.Close()
	scope := scopeOf(r, media)
	var owned int
	var recorded bool
	err = db.QueryRowContext(r.Context(), `SELECT
		(SELECT COUNT(*) FROM "ImageTask" WHERE "workspaceId" = ? AND COALESCE(NULLIF("mediaType", ''), 'image') = ? AND "taskId" = ? AND (?='' OR "id"=?)),
		EXISTS(SELECT 1 FROM "ImageTask" WHERE "taskId" = ?)`, scope.workspace, scope.media, taskID, scope.recordID, scope.recordID, taskID).Scan(&owned, &recorded)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"success": false, "error": "查询任务状态失败，请稍后重试"})
		return false
	}
	if owned > 1 {
		httpx.WriteJSON(w, 409, map[string]any{"success": false, "submissionUnknown": true, "error": "同号任务存在多个渠道记录，请使用原任务记录编号核对"})
		return false
	}
	if owned == 1 || (!recorded && scope.recordID == "" && !cfg.Production() && scope.workspace == "local") {
		if owned == 1 && scope.recordID == "" {
			var recordID string
			if err := db.QueryRowContext(r.Context(), `SELECT "id" FROM "ImageTask" WHERE `+taskScopeWhere+` LIMIT 1`, scope.workspace, scope.media, taskID, "", "").Scan(&recordID); err != nil {
				httpx.WriteJSON(w, 503, map[string]any{"success": false, "submissionUnknown": true, "error": "原任务记录暂时无法核对"})
				return false
			}
			r.Header.Set("x-task-record-id", recordID)
		}
		return true
	}
	httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "submissionUnknown": true, "retryable": true, "error": "未找到任务记录，请核对原任务编号"})
	return false
}

const taskScopeWhere = `"workspaceId"=? AND COALESCE(NULLIF("mediaType",''),'image')=? AND "taskId"=? AND (?='' OR "id"=?)`

func readTaskUsage(ctx context.Context, db *sql.DB, scope taskScope, taskID string) string {
	var raw sql.NullString
	_ = db.QueryRowContext(ctx, `SELECT "usage" FROM "ImageTask" WHERE `+taskScopeWhere+` LIMIT 1`, scope.workspace, scope.media, taskID, scope.recordID, scope.recordID).Scan(&raw)
	return raw.String
}

// Provider usage is a cumulative snapshot, not an increment. The single SQLite
// statement serializes merges, so a stale/concurrent receipt cannot lower it.
func mergeTaskUsage(ctx context.Context, db *sql.DB, scope taskScope, taskID string, usage map[string]any) (map[string]any, error) {
	number := func(key string) float64 {
		n, _ := usage[key].(float64)
		if math.IsNaN(n) || math.IsInf(n, 0) || n < 0 {
			return 0
		}
		return n
	}
	var raw string
	err := db.QueryRowContext(ctx, `WITH previous AS (
 SELECT "id",CASE WHEN json_valid("usage") THEN "usage" ELSE '{}' END AS u FROM "ImageTask" WHERE `+taskScopeWhere+`
 ), merged AS (SELECT "id",
 MAX(CAST(COALESCE(json_extract(u,'$.promptTokens'),json_extract(u,'$.prompt_tokens'),json_extract(u,'$.input_tokens'),json_extract(u,'$.inputTokens'),json_extract(u,'$.promptTokenCount'),0) AS REAL),?) AS p,
 MAX(CAST(COALESCE(json_extract(u,'$.completionTokens'),json_extract(u,'$.completion_tokens'),json_extract(u,'$.output_tokens'),json_extract(u,'$.outputTokens'),json_extract(u,'$.candidatesTokenCount'),0) AS REAL),?) AS c,
 MAX(CAST(COALESCE(json_extract(u,'$.totalTokens'),json_extract(u,'$.total_tokens'),json_extract(u,'$.totalTokenCount'),0) AS REAL),?) AS t FROM previous)
 UPDATE "ImageTask" SET "usage"=json_object('promptTokens',p,'completionTokens',c,'totalTokens',MAX(t,p+c))
 FROM merged WHERE "ImageTask"."id"=merged."id" RETURNING "usage"`,
		scope.workspace, scope.media, taskID, scope.recordID, scope.recordID, number("promptTokens"), number("completionTokens"), number("totalTokens")).Scan(&raw)
	return gateway.DecodeUsage(raw), err
}

func rememberTaskUsage(ctx context.Context, cfg config.Config, scope taskScope, taskID string, usage map[string]any) {
	if usage == nil || taskID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	if scope.recordID != "" {
		if err := db.QueryRowContext(ctx, `SELECT "taskId" FROM "ImageTask" WHERE "id"=? AND "workspaceId"=? AND COALESCE(NULLIF("mediaType",''),'image')=?`, scope.recordID, scope.workspace, scope.media).Scan(&taskID); err != nil {
			return
		}
	}
	_, _ = mergeTaskUsage(ctx, db, scope, taskID, usage)
}

func polledTaskBody(ctx context.Context, cfg config.Config, scope taskScope, taskID string, parsed pollParsed, upstream map[string]any) map[string]any {
	usage := gateway.NormalizeUsage(upstream)
	body := map[string]any{"success": true, "taskId": taskID, "status": parsed.status, "progress": parsed.progress, "resultUrl": parsed.result, "failReason": parsed.reason}
	settlement, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	db, err := openTaskDB(cfg)
	if err == nil {
		defer db.Close()
		if usage != nil {
			var merged map[string]any
			merged, err = mergeTaskUsage(settlement, db, scope, taskID, usage)
			if err == nil {
				usage = merged
			}
		}
		if parsed.status == "SUCCESS" || parsed.status == "FAILURE" {
			updateTaskTerminal(settlement, db, scope, taskID, parsed.status, parsed.result, parsed.reason, "")
		}
		if stored := gateway.DecodeUsage(readTaskUsage(settlement, db, scope, taskID)); stored != nil && err == nil {
			usage = stored
		}
		var recordID string
		if db.QueryRowContext(settlement, `SELECT "id" FROM "ImageTask" WHERE `+taskScopeWhere+` LIMIT 1`, scope.workspace, scope.media, taskID, scope.recordID, scope.recordID).Scan(&recordID) == nil {
			body["recordId"] = recordID
		}
	}
	if usage != nil {
		body["usage"] = usage
		body["usagePersisted"] = err == nil
		if err != nil {
			body["usagePersistenceError"] = "已收到用量，但保存尚未确认，请保留原回执"
		}
	}
	return body
}
