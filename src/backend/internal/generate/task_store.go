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

func reuseImageTask(ctx context.Context, db *sql.DB, workspace, key string) (string, string, bool) {
	if key == "" {
		return "", "", false
	}
	var id, result string
	err := db.QueryRowContext(ctx, `
		SELECT "id", "resultUrl" FROM "ImageTask"
		WHERE "workspaceId" = ? AND "idempotencyKey" = ? AND "status" = 'SUCCESS' AND COALESCE("resultUrl", '') != ''
		ORDER BY "createdAt" DESC LIMIT 1`, workspace, key).Scan(&id, &result)
	if err != nil || result == "" {
		return "", "", false
	}
	return id, result, true
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

func taskStatus(ctx context.Context, db *sql.DB, taskID string) (status, result, reason string, ok bool, err error) {
	var state, url, fail sql.NullString
	err = db.QueryRowContext(ctx, `SELECT "status", "resultUrl", "failReason" FROM "ImageTask" WHERE "taskId" = ? LIMIT 1`, taskID).
		Scan(&state, &url, &fail)
	if err == sql.ErrNoRows {
		return "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", false, err
	}
	return state.String, url.String, fail.String, true, nil
}

func updateTaskTerminal(ctx context.Context, db *sql.DB, taskID, status, result, reason string) {
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, _ = db.ExecContext(ctx, `
		UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ?, "updatedAt" = ?
		WHERE "taskId" = ? AND "status" IN ('PENDING', 'IN_PROGRESS')`,
		status, emptyNull(result), emptyNull(reason), now, taskID)
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
