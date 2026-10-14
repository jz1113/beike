package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var ErrLibraryRecordMissing = errors.New("library record missing")

type LibraryUpdateError struct{ Message string }

func (err LibraryUpdateError) Error() string { return err.Message }

func UpdateLibraryAsset(ctx context.Context, db *sql.DB, workspace, assetType, id string, data map[string]any) (json.RawMessage, error) {
	table, columns, ok := libraryAssetTable(assetType)
	if !ok {
		return nil, LibraryUpdateError{Message: "不支持的资产类型"}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if assetType == "action" {
		if err := requireActionScene(ctx, tx, workspace, data); err != nil {
			return nil, err
		}
	}
	if assetType == "full_prompt" {
		if err := prepareFullPrompt(ctx, tx, workspace, id, data); err != nil {
			return nil, err
		}
	}
	if err := writeLibraryAsset(ctx, tx, table, workspace, id, data); err != nil {
		return nil, err
	}
	item, err := loadLibraryItem(ctx, tx, table, columns, id, workspace)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	committed = true
	return item, nil
}

func libraryAssetTable(assetType string) (string, []assetColumn, bool) {
	switch assetType {
	case "scene":
		return "SceneAsset", sceneAssetColumns, true
	case "outfit":
		return "OutfitAsset", outfitAssetColumns, true
	case "action":
		return "ActionAsset", actionAssetColumns, true
	case "persona":
		return "PersonaAsset", personaAssetColumns, true
	case "full_prompt":
		return "FullPromptAsset", fullPromptAssetColumns, true
	default:
		return "", nil, false
	}
}

func requireActionScene(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any) error {
	value, ok := data["sceneId"]
	if !ok || value == nil || value == "" {
		return nil
	}
	sceneID, ok := value.(string)
	if !ok {
		return LibraryUpdateError{Message: "场景 ID 必须为字符串"}
	}
	var id string
	err := tx.QueryRowContext(ctx, `
		SELECT "id" FROM "SceneAsset" WHERE "id" = ? AND "workspaceId" IN (?, ?)`,
		sceneID, workspace, officialWorkspace).Scan(&id)
	if err == sql.ErrNoRows {
		return LibraryUpdateError{Message: "场景不存在或不属于当前工作区"}
	}
	return err
}

func writeLibraryAsset(ctx context.Context, tx *sql.Tx, table, workspace, id string, data map[string]any) error {
	assignments := make([]string, 0, len(data)+1)
	args := make([]any, 0, len(data)+3)
	for key, value := range data {
		if !libraryColumn(key) {
			return LibraryUpdateError{Message: "不允许更新字段: " + key}
		}
		assignments = append(assignments, `"`+key+`" = ?`)
		stored, err := storedLibraryValue(value)
		if err != nil {
			return err
		}
		args = append(args, stored)
	}
	assignments = append(assignments, `"updatedAt" = ?`)
	args = append(args, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), id, workspace)
	query := `UPDATE "` + table + `" SET ` + strings.Join(assignments, ", ") + ` WHERE "id" = ? AND "workspaceId" = ?`
	result, err := tx.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrLibraryRecordMissing
	}
	return nil
}

func libraryColumn(name string) bool {
	switch name {
	case "title", "description", "lighting", "category", "spatialType", "suitableCategories", "tags",
		"coverUrl", "sourceImages", "reversePrompt", "dimensions", "sourceImageIndex", "imageType",
		"provenance", "usageCount", "isFavorite", "top", "bottom", "shoes", "colorPalette", "action",
		"shotType", "camera", "suitableAnatomy", "sceneId", "shotOrder", "name", "avatarUrl", "albumId",
		"productCategoryIds", "isUniversal", "albumName", "reversePromptZh", "reversePromptEn",
		"hasHuman", "shotFraming", "productFrameRatio", "sceneSummary", "outfitSummary", "actionSummary",
		"personaSummary", "productSubcategory", "displayNumber", "sourceImageIndices", "groupIndex",
		"contentSummary", "architectureSummary", "replaceableSlots", "shotPromptsJson":
		return true
	default:
		return false
	}
}

func storedLibraryValue(value any) (any, error) {
	switch typed := value.(type) {
	case nil:
		return nil, nil
	case string:
		return typed, nil
	case bool:
		if typed {
			return 1, nil
		}
		return 0, nil
	case int64:
		return typed, nil
	default:
		return nil, LibraryUpdateError{Message: "字段类型不正确"}
	}
}
