package poster

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
)

var errCoverRequestMismatch = errors.New("投喂标识已用于其他图片或模型，请重新添加样张")

type coverFeedOperation struct {
	ID     string
	Model  string
	Status string
	Error  string
}

func beginCoverFeed(ctx context.Context, db *sql.DB, workspace, key, title, model, hash string, images []string) (coverFeedOperation, bool, error) {
	id := coverID("sample")
	raw, _ := json.Marshal(images)
	now := coverNow()
	result, err := db.ExecContext(ctx, `INSERT OR IGNORE INTO "CoverMemorySample"
  ("id","workspaceId","title","imageUrls","model","deconstruction","status","error","createdAt","updatedAt","requestKey","inputHash")
  VALUES (?,?,?,?,?,'','running','',?,?,?,?)`, id, workspace, title, string(raw), model, now, now, key, hash)
	if err != nil {
		return coverFeedOperation{}, false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return coverFeedOperation{}, false, err
	}
	if count == 1 {
		return coverFeedOperation{ID: id, Model: model, Status: "running"}, true, nil
	}
	var operation coverFeedOperation
	var storedHash string
	err = db.QueryRowContext(ctx, `SELECT "id","model","status","error","inputHash" FROM "CoverMemorySample" WHERE "workspaceId"=? AND "requestKey"=?`, workspace, key).Scan(&operation.ID, &operation.Model, &operation.Status, &operation.Error, &storedHash)
	if err == nil && hash != storedHash {
		err = errCoverRequestMismatch
	}
	return operation, false, err
}

func replayCoverFeed(w http.ResponseWriter, operation coverFeedOperation) {
	if operation.Status == "completed" {
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "sampleId": operation.ID, "model": operation.Model, "replayed": true})
		return
	}
	message := "原样张仍在反推，请先刷新核对，不要重复投喂"
	if operation.Status == "failed" {
		message = operation.Error + "；请核对后使用重试"
	}
	httpx.WriteJSON(w, 409, map[string]any{"success": false, "sampleId": operation.ID, "error": message, "uncertain": operation.Status == "running"})
}

func coverFeedHash(images []string, model, title, effort, protocol, base string) string {
	raw, _ := json.Marshal([]any{images, model, title, effort, protocol, base})
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}

// A process crash cannot leave a sample looking active forever. No model call is retried here.
func recoverStaleCoverFeeds(ctx context.Context, db *sql.DB, workspace string) error {
	cutoff := time.Now().UTC().Add(-5 * time.Minute).Format(time.RFC3339Nano)
	_, err := db.ExecContext(ctx, `UPDATE "CoverMemorySample" SET "status"='failed',"error"='反推执行已中断，请核对后手动重试',"updatedAt"=? WHERE "workspaceId"=? AND "status"='running' AND "updatedAt"<?`, coverNow(), workspace, cutoff)
	return err
}

func coverRequestKey(payload map[string]any) (string, bool) {
	value, exists := payload["requestKey"]
	if !exists {
		return "", true
	}
	text, ok := value.(string)
	text = strings.TrimSpace(text)
	return text, ok && len(text) >= 8 && len(text) <= 128
}
