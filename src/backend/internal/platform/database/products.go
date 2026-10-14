package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"beike.local/cloud/src/backend/internal/platform/media"
)

var ErrProductMissing = errors.New("记录不存在")

func ListProducts(ctx context.Context, db *sql.DB, workspace string, page, pageSize int) (int, []map[string]any, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "Product" WHERE "workspaceId" = ?`, workspace).Scan(&total); err != nil {
		return 0, nil, err
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt"
		FROM "Product" WHERE "workspaceId" = ?
		ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`, workspace, pageSize, (page-1)*pageSize)
	if err != nil {
		return 0, nil, err
	}
	defer rows.Close()
	products := []map[string]any{}
	for rows.Next() {
		var id, workspaceID, platform, createdAt string
		var itemID, title, picURL, detailURLs sql.NullString
		if err := rows.Scan(&id, &workspaceID, &platform, &itemID, &title, &picURL, &detailURLs, &createdAt); err != nil {
			return 0, nil, err
		}
		cleaned, count := cleanDetailURLs(nullText(detailURLs))
		products = append(products, map[string]any{
			"id": id, "workspaceId": workspaceID, "platform": platform,
			"itemId": nullText(itemID), "title": nullText(title),
			"picUrl":     media.NormalizeImageURLToStandardJpg(stringValue(picURL)),
			"detailUrls": cleaned, "createdAt": formatSQLiteTime(createdAt), "imageCount": count,
		})
	}
	return total, products, rows.Err()
}

func cleanDetailURLs(raw any) (any, int) {
	text, ok := raw.(string)
	if !ok || text == "" {
		return raw, 0
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return text, 0
	}
	count := 0
	for _, key := range []string{"main", "skus", "details"} {
		cleaned := []any{}
		if list, ok := parsed[key].([]any); ok {
			for _, item := range list {
				address, ok := item.(string)
				if !ok {
					continue
				}
				normalized := media.NormalizeImageURLToStandardJpg(address)
				if media.IsProductImageURL(normalized) {
					cleaned = append(cleaned, normalized)
				}
			}
		}
		parsed[key] = cleaned
		count += len(cleaned)
	}
	body, err := json.Marshal(parsed)
	if err != nil {
		return text, 0
	}
	return string(body), count
}

func SaveCollectedProduct(ctx context.Context, db *sql.DB, workspace, platform, itemID, title, cleanPicURL string, savedImages []string) (map[string]any, error) {
	detailURLs, err := json.Marshal(map[string]any{"main": savedImages})
	if err != nil {
		return nil, err
	}
	var id, createdAt string
	var existingPic sql.NullString
	err = db.QueryRowContext(ctx, `
		SELECT "id", "createdAt", "picUrl" FROM "Product"
		WHERE "workspaceId" = ? AND "platform" = ? AND "itemId" = ?`, workspace, platform, itemID).Scan(&id, &createdAt, &existingPic)
	picURL := cleanPicURL
	if picURL == "" {
		picURL = media.NormalizeImageURLToStandardJpg(stringValue(existingPic))
	}
	if errors.Is(err, sql.ErrNoRows) {
		id, err = randomHex()
		if err != nil {
			return nil, err
		}
		createdAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		if picURL == "" {
			picURL = cleanPicURL
		}
		_, err = db.ExecContext(ctx, `
			INSERT INTO "Product" ("id", "workspaceId", "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, workspace, platform, itemID, title, picURL, string(detailURLs), createdAt)
	} else if err != nil {
		return nil, err
	} else {
		_, err = db.ExecContext(ctx, `
			UPDATE "Product" SET "title" = ?, "picUrl" = ?, "detailUrls" = ?
			WHERE "id" = ? AND "workspaceId" = ?`, title, picURL, string(detailURLs), id, workspace)
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "platform": platform, "itemId": itemID,
		"title": title, "picUrl": picURL, "detailUrls": string(detailURLs), "createdAt": formatSQLiteTime(createdAt),
	}, nil
}

func UpdateProduct(ctx context.Context, db *sql.DB, workspace, id string, title, itemID, picURL *string, detailURLs *string) (map[string]any, error) {
	current, err := loadProduct(ctx, db, workspace, id)
	if err != nil {
		return nil, err
	}
	if title != nil {
		current["title"] = *title
	}
	if itemID != nil {
		current["itemId"] = *itemID
	}
	if picURL != nil {
		current["picUrl"] = *picURL
	}
	if detailURLs != nil {
		current["detailUrls"] = *detailURLs
	}
	_, err = db.ExecContext(ctx, `
		UPDATE "Product" SET "title" = ?, "itemId" = ?, "picUrl" = ?, "detailUrls" = ?
		WHERE "id" = ? AND "workspaceId" = ?`,
		current["title"], current["itemId"], current["picUrl"], current["detailUrls"], id, workspace)
	if err != nil {
		return nil, err
	}
	return current, nil
}

func loadProduct(ctx context.Context, db *sql.DB, workspace, id string) (map[string]any, error) {
	var platform, createdAt string
	var itemID, title, picURL, detailURLs sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt"
		FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&platform, &itemID, &title, &picURL, &detailURLs, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrProductMissing
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "platform": platform,
		"itemId": nullText(itemID), "title": nullText(title), "picUrl": nullText(picURL),
		"detailUrls": nullText(detailURLs), "createdAt": formatSQLiteTime(createdAt),
	}, nil
}

func stringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}
