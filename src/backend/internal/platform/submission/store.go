// Package submission stores durable, workspace-scoped receipts before billable calls.
package submission

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"beike.local/cloud/src/backend/internal/platform/database"
)

var ErrNotFound = errors.New("operation receipt not found")
var ErrConflict = errors.New("operation key belongs to different inputs")

type Receipt struct {
	ID, Key, Fingerprint string
	Status               int
	Body                 map[string]any
}

func NewKey() string {
	var data [24]byte
	if _, err := rand.Read(data[:]); err != nil {
		return ""
	}
	return hex.EncodeToString(data[:])
}

func Hash(value any) string {
	encoded, _ := json.Marshal(value)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func read(ctx context.Context, db *sql.DB, workspace, kind, key string) (Receipt, error) {
	row := Receipt{Key: key}
	var body string
	err := db.QueryRowContext(ctx, `SELECT "id", "fingerprint", "httpStatus", "response"
  FROM "GenerationSubmission" WHERE "workspaceId" = ? AND "kind" = ? AND "operationKey" = ?`, workspace, kind, key).
		Scan(&row.ID, &row.Fingerprint, &row.Status, &body)
	if err == sql.ErrNoRows {
		return row, ErrNotFound
	}
	if err != nil {
		return row, err
	}
	if row.Status != 0 && (body == "" || json.Unmarshal([]byte(body), &row.Body) != nil || row.Body == nil) {
		return row, errors.New("invalid operation receipt")
	}
	return row, nil
}

func Read(ctx context.Context, path, workspace, kind, key string) (Receipt, error) {
	db, err := database.OpenRequired(path)
	if err != nil {
		return Receipt{}, err
	}
	defer db.Close()
	return read(ctx, db, workspace, kind, key)
}

func claim(ctx context.Context, path, workspace, kind, key, fingerprint string) (Receipt, bool, error) {
	db, err := database.OpenRequired(path)
	if err != nil {
		return Receipt{}, false, err
	}
	defer db.Close()
	id := NewKey()
	if id == "" {
		return Receipt{}, false, errors.New("cannot allocate operation identity")
	}
	result, err := db.ExecContext(ctx, `INSERT INTO "GenerationSubmission"
  ("id", "workspaceId", "kind", "operationKey", "fingerprint", "httpStatus", "response", "createdAt", "updatedAt")
  VALUES (?, ?, ?, ?, ?, 0, '', ?, ?) ON CONFLICT("workspaceId", "kind", "operationKey") DO NOTHING`,
		id, workspace, kind, key, fingerprint, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return Receipt{}, false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return Receipt{}, false, err
	}
	row, err := read(ctx, db, workspace, kind, key)
	// A durable closure rejects every delayed input for this key; replay it even
	// though it has no original request fingerprint. Never dispatch its owner.
	if err == nil && row.Fingerprint != fingerprint && !(row.Fingerprint == "closed" && row.Body["submissionClosed"] == true) {
		err = ErrConflict
	}
	return row, count == 1, err
}

func finish(ctx context.Context, path string, receipt Receipt, status int, body map[string]any) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return err
	}
	db, err := database.OpenRequired(path)
	if err != nil {
		return err
	}
	defer db.Close()
	result, err := db.ExecContext(ctx, `UPDATE "GenerationSubmission" SET "httpStatus" = ?, "response" = ?, "updatedAt" = ? WHERE "id" = ? AND "httpStatus" = 0`,
		status, string(encoded), time.Now().UTC().Format(time.RFC3339Nano), receipt.ID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err == nil && count != 1 {
		return errors.New("operation receipt settlement was not confirmed")
	}
	return err
}

// Claim atomically reserves an internal billable stage. Only its owner may dispatch.
func Claim(ctx context.Context, path, workspace, kind, key, fingerprint string) (Receipt, bool, error) {
	return claim(ctx, path, workspace, kind, key, fingerprint)
}

// Finish durably settles a claimed stage; a failed settlement leaves it unknown.
func Finish(ctx context.Context, path string, receipt Receipt, status int, body map[string]any) error {
	return finish(ctx, path, receipt, status, body)
}
