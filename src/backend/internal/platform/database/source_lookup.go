package database

import (
	"context"
	"database/sql"
	"time"
)

type ImportSource struct {
	Key, RequestID, State, AlbumName, UpdatedAt string
	AlbumID                                     sql.NullString
	Found                                       bool
}

func LookupImportSource(ctx context.Context, db *sql.DB, workspace, key string) (ImportSource, error) {
	row, err := readImportSource(ctx, db, workspace, key)
	if err != nil || !row.Found {
		return row, err
	}
	if row.State == "approved" && row.AlbumID.Valid {
		var assets int
		if err := db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM "FullPromptAsset"
			WHERE "workspaceId" IN (?, ?) AND "albumId" = ?`, workspace, officialWorkspace, row.AlbumID.String).Scan(&assets); err != nil {
			return ImportSource{}, err
		}
		if assets == 0 {
			if _, err := db.ExecContext(ctx, `
				DELETE FROM "PromptImportSource"
				WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ? AND "state" = 'approved'`,
				workspace, key, row.RequestID); err != nil {
				return ImportSource{}, err
			}
			return ImportSource{}, nil
		}
	}
	if row.State != "approved" {
		var status string
		err := db.QueryRowContext(ctx, `
			SELECT "status" FROM "DeconstructReview" WHERE "workspaceId" = ? AND "id" = ?`, workspace, row.RequestID).Scan(&status)
		if err == nil {
			row.State = status
			return row, nil
		}
		if err != sql.ErrNoRows {
			return ImportSource{}, err
		}
	}
	if row.State == "processing" && staleSource(row.UpdatedAt) {
		if err := releaseStaleSource(ctx, db, workspace, row); err != nil {
			return ImportSource{}, err
		}
		return readImportSource(ctx, db, workspace, key)
	}
	return row, nil
}

func readImportSource(ctx context.Context, db *sql.DB, workspace, key string) (ImportSource, error) {
	var row ImportSource
	err := db.QueryRowContext(ctx, `
		SELECT "sourceKey", "requestId", "state", "albumName", "albumId", "updatedAt"
		FROM "PromptImportSource" WHERE "workspaceId" = ? AND "sourceKey" = ?`, workspace, key).Scan(&row.Key, &row.RequestID, &row.State, &row.AlbumName, &row.AlbumID, &row.UpdatedAt)
	if err == sql.ErrNoRows {
		return ImportSource{}, nil
	}
	if err != nil {
		return ImportSource{}, err
	}
	row.Found = true
	return row, nil
}

func staleSource(updated string) bool {
	parsed, err := time.Parse(time.RFC3339Nano, updated)
	if err != nil {
		if parsed, err = time.Parse("2006-01-02T15:04:05.000Z", updated); err != nil {
			return false
		}
	}
	return !parsed.After(time.Now().Add(-5 * time.Minute))
}

func releaseStaleSource(ctx context.Context, db *sql.DB, workspace string, row ImportSource) error {
	var status string
	err := db.QueryRowContext(ctx, `SELECT "status" FROM "DeconstructReview" WHERE "workspaceId" = ? AND "id" = ?`, workspace, row.RequestID).Scan(&status)
	if err == nil {
		_, err = db.ExecContext(ctx, `
			UPDATE "PromptImportSource" SET "state" = ?
			WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ?`, status, workspace, row.Key, row.RequestID)
		return err
	}
	if err != sql.ErrNoRows {
		return err
	}
	if row.AlbumID.Valid {
		var assets int
		if err := db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM "FullPromptAsset" WHERE "workspaceId" IN (?, ?) AND "albumId" = ?`,
			workspace, officialWorkspace, row.AlbumID.String).Scan(&assets); err != nil {
			return err
		}
		if assets > 0 {
			_, err = db.ExecContext(ctx, `
				UPDATE "PromptImportSource" SET "state" = 'approved'
				WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ?`, workspace, row.Key, row.RequestID)
			return err
		}
	}
	_, err = db.ExecContext(ctx, `
		DELETE FROM "PromptImportSource"
		WHERE "workspaceId" = ? AND "sourceKey" = ? AND "requestId" = ? AND "state" = 'processing'`,
		workspace, row.Key, row.RequestID)
	return err
}
