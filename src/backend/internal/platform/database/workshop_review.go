package database

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

type ActiveWorkshopBatch struct {
	ID       string
	Snapshot string
	Status   string
}

func ReadActiveWorkshopBatch(ctx context.Context, db *sql.DB, workspace string) (ActiveWorkshopBatch, error) {
	var batch ActiveWorkshopBatch
	err := db.QueryRowContext(ctx, `
		SELECT b."id", b."snapshotJson", b."status"
		FROM "WorkshopBatchState" s
		JOIN "WorkshopBatch" b ON b."id" = s."activeBatchId" AND b."workspaceId" = s."workspaceId"
		WHERE s."workspaceId" = ?`, workspace).Scan(&batch.ID, &batch.Snapshot, &batch.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return ActiveWorkshopBatch{}, nil
	}
	return batch, err
}

type OutputReview struct {
	BatchID     string
	ProductID   string
	TaskID      string
	Decision    string
	Fidelity    *int
	Composition *int
	Aesthetic   *int
	Consistency *int
	ReasonCodes []string
	Note        string
	AssetIDs    []string
}

func InsertOutputReview(ctx context.Context, db *sql.DB, workspace string, review OutputReview) error {
	reasons, err := json.Marshal(review.ReasonCodes)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = db.ExecContext(ctx, `
		INSERT INTO "WorkshopOutputReview"
		("id", "workspaceId", "batchId", "productId", "taskId", "decision", "productFidelityScore", "compositionScore", "aestheticScore", "consistencyScore", "reasonCodesJson", "note", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"wor_"+randomID(), workspace, review.BatchID, review.ProductID, review.TaskID, review.Decision,
		review.Fidelity, review.Composition, review.Aesthetic, review.Consistency, string(reasons), review.Note, now)
	if err != nil {
		return err
	}
	event := map[string]string{
		"accepted": "output_accepted", "retry_requested": "retry_requested", "rejected": "output_rejected",
	}[review.Decision]
	for _, assetID := range review.AssetIDs {
		if assetID == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO "PromptAssetUsageEvent"
			("id", "workspaceId", "assetId", "batchId", "productId", "taskId", "eventType", "createdAt", "metadata")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
			"uev_"+randomID(), workspace, assetID, review.BatchID, review.ProductID, review.TaskID, event, now); err != nil {
			return err
		}
	}
	return nil
}

func randomID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "review"
	}
	return hex.EncodeToString(buf[:])
}
