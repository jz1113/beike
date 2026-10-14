package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

func insertPersonaAsset(ctx context.Context, tx *sql.Tx, workspace, id, now string, data map[string]any) error {
	name, err := textOrDefault(data["name"], "新人设博主")
	if err != nil {
		return err
	}
	description, err := textOrDefault(data["description"], "")
	if err != nil {
		return err
	}
	tags, err := tagsText(data["tags"])
	if err != nil {
		return err
	}
	avatar, err := textOrDefault(data["avatarUrl"], "")
	if err != nil {
		return err
	}
	albumID, categories, universal, err := personaOrganization(ctx, tx, workspace, data)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "PersonaAsset" (
			"id", "workspaceId", "name", "description", "tags", "avatarUrl", "provenance",
			"usageCount", "isFavorite", "createdAt", "updatedAt", "albumId", "productCategoryIds", "isUniversal"
		) VALUES (?, ?, ?, ?, ?, ?, 'manual', 0, 0, ?, ?, ?, ?, ?)`,
		id, workspace, name, description, tags, avatar, now, now, albumID, categories, universal)
	return err
}

func personaOrganization(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any) (any, string, int, error) {
	if value, ok := data["productCategoryIds"]; ok {
		if message := validCategoryList(value); message != "" {
			return nil, "", 0, LibraryFailure{Message: message}
		}
	}
	if value, ok := data["isUniversal"]; ok {
		if _, ok := value.(bool); !ok {
			return nil, "", 0, LibraryFailure{Message: "通用标记必须为布尔值"}
		}
	}
	ids := []string{}
	if text, ok := data["productCategoryIds"].(string); ok {
		ids = database.CategoryIDList(text)
	}
	if err := requirePersonaCategories(ctx, tx, workspace, ids); err != nil {
		return nil, "", 0, err
	}
	albumID, err := personaAlbumID(ctx, tx, workspace, data["albumId"])
	if err != nil {
		return nil, "", 0, err
	}
	universal := 0
	if data["isUniversal"] == true {
		universal = 1
	}
	return albumID, database.CategoryJSON(ids), universal, nil
}

func validCategoryList(value any) string {
	text, ok := value.(string)
	if !ok {
		return "商品品类必须为 JSON 数组"
	}
	var parsed any
	if json.Unmarshal([]byte(text), &parsed) != nil {
		return "商品品类必须为 JSON 数组"
	}
	list, ok := parsed.([]any)
	if !ok {
		return "商品品类必须为 JSON 数组"
	}
	for _, item := range list {
		if _, ok := item.(string); !ok {
			return "商品品类必须为 JSON 数组"
		}
	}
	return ""
}

func requirePersonaCategories(ctx context.Context, tx *sql.Tx, workspace string, ids []string) error {
	err := requireCategoryIDs(ctx, tx, workspace, ids)
	var text database.ErrText
	if errors.As(err, &text) {
		return LibraryFailure{Message: text.Error()}
	}
	return err
}

func personaAlbumID(ctx context.Context, tx *sql.Tx, workspace string, value any) (any, error) {
	if !createTruthy(value) {
		return nil, nil
	}
	id := fmt.Sprint(value)
	var found string
	err := tx.QueryRowContext(ctx, `
		SELECT "id" FROM "PromptAlbum" WHERE "id" = ? AND "workspaceId" IN (?, ?)`,
		id, workspace, database.OfficialWorkspace).Scan(&found)
	if err == sql.ErrNoRows {
		return nil, LibraryFailure{Message: "图集不存在"}
	}
	if err != nil {
		return nil, err
	}
	return id, nil
}
