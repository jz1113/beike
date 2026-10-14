package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

func ListDeconstructReviews(ctx context.Context, db *sql.DB, workspace, status string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "albumName", "payload", "status", "createdAt"
		FROM "DeconstructReview"
		WHERE "workspaceId" = ? AND "status" = ?
		ORDER BY "createdAt" DESC`, workspace, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	reviews := []map[string]any{}
	for rows.Next() {
		var id, workspaceID, albumName, payload, rowStatus, createdAt string
		if err := rows.Scan(&id, &workspaceID, &albumName, &payload, &rowStatus, &createdAt); err != nil {
			return nil, err
		}
		var parsed any
		if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
			return nil, fmt.Errorf("审核内容无法读取")
		}
		reviews = append(reviews, map[string]any{
			"id": id, "workspaceId": workspaceID, "albumName": albumName,
			"payload": parsed, "status": rowStatus, "createdAt": createdAt,
		})
	}
	return reviews, rows.Err()
}

func GetDeconstructReview(ctx context.Context, db *sql.DB, workspace, id string) (string, string, string, bool, error) {
	var album, payload, status string
	err := db.QueryRowContext(ctx, `
		SELECT "albumName", "payload", "status" FROM "DeconstructReview"
		WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(&album, &payload, &status)
	if err == sql.ErrNoRows {
		return "", "", "", false, nil
	}
	return album, payload, status, err == nil, err
}

func InsertDeconstructReview(ctx context.Context, db *sql.DB, workspace, id, album, payload string) error {
	_, err := db.ExecContext(ctx, `
		INSERT OR IGNORE INTO "DeconstructReview" ("id","workspaceId","albumName","payload","status","createdAt")
		VALUES (?,?,?,?, 'pending', ?)`, id, workspace, album, payload, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func UpdateDeconstructReviewStatus(ctx context.Context, db *sql.DB, workspace, id, from, to string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE "DeconstructReview" SET "status" = ?
		WHERE "workspaceId" = ? AND "id" = ? AND "status" = ?`, to, workspace, id, from)
	return err
}
