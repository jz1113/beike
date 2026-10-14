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

func ListRecentPromptRecords(ctx context.Context, db *sql.DB, workspace string) ([]map[string]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "workspaceId", "productId", "productTitle", "productFingerprint", "modelUsed", "styleName", "promptsJson", "createdAt"
		FROM "PromptRecord"
		WHERE "workspaceId" = ?
		ORDER BY "createdAt" DESC
		LIMIT 50`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []map[string]any{}
	for rows.Next() {
		var id, workspaceID, promptsJSON, createdAt string
		var productID, productTitle, fingerprint, modelUsed, styleName sql.NullString
		if err := rows.Scan(&id, &workspaceID, &productID, &productTitle, &fingerprint, &modelUsed, &styleName, &promptsJSON, &createdAt); err != nil {
			return nil, err
		}
		prompts, shotCount, includeCount := parsePromptList(promptsJSON)
		record := map[string]any{
			"id": id, "workspaceId": workspaceID,
			"productId": nullText(productID), "productTitle": nullText(productTitle),
			"productFingerprint": nullText(fingerprint), "modelUsed": nullText(modelUsed),
			"styleName": nullText(styleName), "promptsJson": promptsJSON,
			"createdAt": formatSQLiteTime(createdAt), "prompts": prompts,
		}
		if includeCount {
			record["shotCount"] = shotCount
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func parsePromptList(raw string) (any, int, bool) {
	if raw == "" {
		return []any{}, 0, true
	}
	var parsed any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []any{}, 0, true
	}
	if list, ok := parsed.([]any); ok {
		return list, len(list), true
	}
	return parsed, 0, false
}

func CreatePromptRecord(ctx context.Context, db *sql.DB, workspace string, input PromptDraft) (map[string]any, error) {
	id, err := randomHex()
	if err != nil {
		return nil, err
	}
	created := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err = db.ExecContext(ctx, `
		INSERT INTO "PromptRecord" ("id", "workspaceId", "productId", "productTitle", "productFingerprint", "modelUsed", "styleName", "promptsJson", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, workspace, input.ProductID, input.ProductTitle, input.Fingerprint, input.ModelUsed, input.StyleName, input.PromptsJSON, created)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id": id, "workspaceId": workspace, "productId": input.ProductID, "productTitle": input.ProductTitle,
		"productFingerprint": input.Fingerprint, "modelUsed": input.ModelUsed, "styleName": input.StyleName,
		"promptsJson": input.PromptsJSON, "createdAt": created,
	}, nil
}

func DeletePromptRecord(ctx context.Context, db *sql.DB, workspace, id string) error {
	result, err := db.ExecContext(ctx, `DELETE FROM "PromptRecord" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errPromptMissing
	}
	return nil
}

type PromptDraft struct {
	ProductID    any
	ProductTitle string
	Fingerprint  string
	ModelUsed    string
	StyleName    string
	PromptsJSON  string
}

var errPromptMissing = errors.New("记录不存在")

func randomHex() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func nullText(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
