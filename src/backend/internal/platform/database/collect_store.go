package database

import (
	"context"
	"database/sql"
	"time"
)

func LoadCollectedProduct(ctx context.Context, db *sql.DB, workspace, platform, itemID string) (string, string, string, string, string, bool, error) {
	var id, createdAt string
	var title, picURL, detailURLs sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "id", "title", "picUrl", "detailUrls", "createdAt" FROM "Product"
		WHERE "workspaceId" = ? AND "platform" = ? AND "itemId" = ?`, workspace, platform, itemID).Scan(&id, &title, &picURL, &detailURLs, &createdAt)
	if err == sql.ErrNoRows {
		return "", "", "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", "", "", false, err
	}
	return id, StringValue(title), StringValue(picURL), StringValue(detailURLs), FormatSQLiteTime(createdAt), true, nil
}

func SaveCollectDetail(ctx context.Context, db *sql.DB, workspace, platform, itemID, title, picURL, detailURLs string) (string, string, error) {
	var id, createdAt string
	err := db.QueryRowContext(ctx, `
		SELECT "id", "createdAt" FROM "Product"
		WHERE "workspaceId" = ? AND "platform" = ? AND "itemId" = ?`, workspace, platform, itemID).Scan(&id, &createdAt)
	if err == sql.ErrNoRows {
		id, err = RandomHex()
		if err != nil {
			return "", "", err
		}
		createdAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		_, err = db.ExecContext(ctx, `
			INSERT INTO "Product" ("id", "workspaceId", "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, workspace, platform, itemID, title, picURL, detailURLs, createdAt)
		return id, createdAt, err
	}
	if err != nil {
		return "", "", err
	}
	_, err = db.ExecContext(ctx, `
		UPDATE "Product" SET "title" = ?, "picUrl" = ?, "detailUrls" = ?
		WHERE "id" = ? AND "workspaceId" = ?`, title, picURL, detailURLs, id, workspace)
	return id, FormatSQLiteTime(createdAt), err
}
