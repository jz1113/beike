package generate

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type imageTaskDraft struct {
	ProductID      string
	Prompt         string
	TaskID         string
	Model          string
	Size           string
	Quality        string
	ResultURL      string
	Status         string
	MediaType      string
	IdempotencyKey string
	FailReason     string
}

func openTaskDB(cfg config.Config) (*sql.DB, error) {
	return httpx.OpenDB(cfg)
}

func reuseImageTask(ctx context.Context, db *sql.DB, workspace, key string) (string, string, string, bool) {
	if key == "" {
		return "", "", "", false
	}
	var id, taskID, result string
	err := db.QueryRowContext(ctx, `
		SELECT "id", COALESCE("taskId", ''), "resultUrl" FROM "ImageTask"
		WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "status" = 'SUCCESS' AND COALESCE("resultUrl", '') != ''
		ORDER BY "createdAt" DESC LIMIT 1`, workspace, key).Scan(&id, &taskID, &result)
	if err != nil || result == "" {
		return "", "", "", false
	}
	return id, taskID, result, true
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
			"updatedAt" = ?
		WHERE "id" = ?`,
		patch.TaskID, patch.TaskID,
		patch.Status, patch.Status,
		patch.ResultURL, patch.ResultURL,
		emptyNull(patch.FailReason),
		patch.Model, patch.Model,
		patch.Prompt, patch.Prompt,
		patch.Size, patch.Size,
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

func taskStatus(ctx context.Context, db *sql.DB, taskID string) (status, result, reason, usage string, ok bool, err error) {
	var state, url, fail sql.NullString
	err = db.QueryRowContext(ctx, `SELECT "status", "resultUrl", "failReason" FROM "ImageTask" WHERE "taskId" = ? LIMIT 1`, taskID).
		Scan(&state, &url, &fail)
	if err == sql.ErrNoRows {
		return "", "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", "", false, err
	}
	return state.String, url.String, fail.String, readTaskUsage(ctx, db, taskID), true, nil
}

func readTaskUsage(ctx context.Context, db *sql.DB, taskID string) string {
	var usage sql.NullString
	err := db.QueryRowContext(ctx, `SELECT "usage" FROM "ImageTask" WHERE "taskId" = ? LIMIT 1`, taskID).Scan(&usage)
	if err != nil {
		return ""
	}
	return usage.String
}

func updateTaskTerminal(ctx context.Context, db *sql.DB, taskID, status, result, reason, usageJSON string) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if usageJSON != "" {
		_, err := db.ExecContext(ctx, `
			UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ?, "usage" = ?, "updatedAt" = ?
			WHERE "taskId" = ? AND "status" IN ('PENDING', 'IN_PROGRESS')`,
			status, emptyNull(result), emptyNull(reason), usageJSON, now, taskID)
		if err == nil {
			return
		}
	}
	_, _ = db.ExecContext(ctx, `
		UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ?, "updatedAt" = ?
		WHERE "taskId" = ? AND "status" IN ('PENDING', 'IN_PROGRESS')`,
		status, emptyNull(result), emptyNull(reason), now, taskID)
}

func rememberTaskUsage(ctx context.Context, cfg config.Config, taskID string, usage map[string]any) {
	raw := EncodeUsage(usage)
	if raw == "" || taskID == "" {
		return
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	_, _ = db.ExecContext(ctx, `
		UPDATE "ImageTask" SET "usage" = ?
		WHERE "taskId" = ? AND ("usage" IS NULL OR "usage" = '')`, raw, taskID)
}

func polledTaskBody(ctx context.Context, cfg config.Config, taskID string, parsed pollParsed, upstream map[string]any) map[string]any {
	usage := NormalizeUsage(upstream)
	if parsed.status == "SUCCESS" || parsed.status == "FAILURE" {
		if db, err := openTaskDB(cfg); err == nil {
			updateTaskTerminal(ctx, db, taskID, parsed.status, parsed.result, parsed.reason, EncodeUsage(usage))
			_ = db.Close()
		}
	}
	body := map[string]any{
		"success": true, "taskId": taskID, "status": parsed.status, "progress": parsed.progress,
		"resultUrl": parsed.result, "failReason": parsed.reason,
	}
	if usage != nil {
		body["usage"] = usage
	}
	return body
}

func putStoredUsage(body map[string]any, raw string) {
	if usage := DecodeUsage(raw); usage != nil {
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
