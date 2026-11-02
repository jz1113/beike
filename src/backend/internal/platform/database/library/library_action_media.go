package library

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"strings"
)

// The same conversion can be saved again after a lost response without duplicating it.
func actionSubmission(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any) (string, json.RawMessage, error) {
	value, present := data["clientTaskId"]
	if !present {
		return "", nil, nil
	}
	operation, ok := value.(string)
	if !ok || len(operation) == 0 || len(operation) > 256 {
		return "", nil, LibraryUpdateError{Message: "动作任务标识无效"}
	}
	sum := sha256.Sum256([]byte(workspace + "\x00sales-action\x00" + operation))
	id := "c" + hex.EncodeToString(sum[:])[:24]
	item, err := loadLibraryItem(ctx, tx, "ActionAsset", actionAssetColumns, id, workspace)
	if err == sql.ErrNoRows {
		return id, nil, nil
	}
	return id, item, err
}

func validateActionMediaUpdate(ctx context.Context, tx *sql.Tx, workspace, id string, data map[string]any) error {
	_, kindSet := data["mediaType"]
	_, mediaSet := data["mediaUrl"]
	_, sourceSet := data["sourceUrl"]
	if !kindSet && !mediaSet && !sourceSet {
		return nil
	}
	var kind, media, source string
	err := tx.QueryRowContext(ctx, `SELECT COALESCE("mediaType",'image'),COALESCE("mediaUrl",''),COALESCE("sourceUrl",'') FROM "ActionAsset" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&kind, &media, &source)
	if err == sql.ErrNoRows {
		return ErrLibraryRecordMissing
	}
	if err != nil {
		return err
	}
	merged := map[string]any{"mediaType": kind, "mediaUrl": media, "sourceUrl": source}
	for _, key := range []string{"mediaType", "mediaUrl", "sourceUrl"} {
		if value, ok := data[key]; ok {
			merged[key] = value
		}
	}
	_, _, _, err = actionMediaValues(merged)
	return err
}

func actionMediaValues(data map[string]any) (string, string, string, error) {
	kind, err := textOrDefault(data["mediaType"], "image")
	if err != nil {
		return "", "", "", err
	}
	if kind != "image" && kind != "video" && kind != "depth-image" && kind != "depth-video" {
		return "", "", "", LibraryUpdateError{Message: "动作媒体类型无效"}
	}
	media, err := textOrDefault(data["mediaUrl"], "")
	if err != nil {
		return "", "", "", err
	}
	source, err := textOrDefault(data["sourceUrl"], "")
	if err != nil {
		return "", "", "", err
	}
	if kind != "image" && strings.TrimSpace(media) == "" {
		return "", "", "", LibraryUpdateError{Message: "请上传动作图片或视频"}
	}
	return kind, media, source, nil
}
