package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var errLibraryCreateValue = errors.New("library create value")

type LibraryFailure struct{ Message string }

func (err LibraryFailure) Error() string { return err.Message }

func CreateLibraryAsset(ctx context.Context, db *sql.DB, workspace, assetType string, data map[string]any) (json.RawMessage, error) {
	if assetType == "full_prompt" {
		return createFullPromptAsset(ctx, db, workspace, data)
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
	id, err := newLibraryID()
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	switch assetType {
	case "scene":
		err = insertSceneAsset(ctx, tx, workspace, id, now, data)
	case "outfit":
		err = insertOutfitAsset(ctx, tx, workspace, id, now, data)
	case "action":
		err = insertActionAsset(ctx, tx, workspace, id, now, data)
	case "persona":
		err = insertPersonaAsset(ctx, tx, workspace, id, now, data)
	default:
		return nil, errLibraryCreateValue
	}
	if err != nil {
		return nil, err
	}
	table, columns, _ := libraryAssetTable(assetType)
	item, err := loadLibraryItem(ctx, tx, table, columns, id, workspace)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	committed = true
	ensureCreateRegistry(ctx, db, workspace, assetType, id, "manual", now)
	return item, nil
}

func insertSceneAsset(ctx context.Context, tx *sql.Tx, workspace, id, now string, data map[string]any) error {
	title, err := textOrDefault(data["title"], "新生活场景")
	if err != nil {
		return err
	}
	description, err := textOrDefault(data["description"], "")
	if err != nil {
		return err
	}
	lighting, err := textOrDefault(data["lighting"], "自然采光与清晰接触阴影")
	if err != nil {
		return err
	}
	category, err := textOrDefault(data["category"], "general")
	if err != nil {
		return err
	}
	categories, err := jsonListOrString(data["suitableCategories"], []any{})
	if err != nil {
		return err
	}
	tags, err := tagsText(data["tags"])
	if err != nil {
		return err
	}
	cover, err := textOrDefault(data["coverUrl"], "")
	if err != nil {
		return err
	}
	sources, err := jsonListOrString(data["sourceImages"], []any{})
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "SceneAsset" (
			"id", "workspaceId", "title", "description", "lighting", "category", "spatialType",
			"suitableCategories", "tags", "coverUrl", "sourceImages", "provenance", "usageCount",
			"isFavorite", "createdAt", "updatedAt", "productCategoryIds", "isUniversal"
		) VALUES (?, ?, ?, ?, ?, ?, 'indoor_room', ?, ?, ?, ?, 'manual', 0, 0, ?, ?, '[]', 0)`,
		id, workspace, title, description, lighting, category, categories, tags, cover, sources, now, now)
	return err
}

func insertOutfitAsset(ctx context.Context, tx *sql.Tx, workspace, id, now string, data map[string]any) error {
	title, err := textOrDefault(data["title"], "新显白穿搭")
	if err != nil {
		return err
	}
	top, err := textOrDefault(data["top"], "")
	if err != nil {
		return err
	}
	bottom, err := textOrDefault(data["bottom"], "")
	if err != nil {
		return err
	}
	shoes, err := textOrDefault(data["shoes"], "")
	if err != nil {
		return err
	}
	palette, err := textOrDefault(data["colorPalette"], "")
	if err != nil {
		return err
	}
	category, err := textOrDefault(data["category"], "general")
	if err != nil {
		return err
	}
	categories, err := jsonListOrString(data["suitableCategories"], []any{})
	if err != nil {
		return err
	}
	tags, err := tagsText(data["tags"])
	if err != nil {
		return err
	}
	cover, err := textOrDefault(data["coverUrl"], "")
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "OutfitAsset" (
			"id", "workspaceId", "title", "top", "bottom", "shoes", "colorPalette", "category",
			"suitableCategories", "tags", "coverUrl", "provenance", "usageCount", "isFavorite",
			"createdAt", "updatedAt", "productCategoryIds", "isUniversal"
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, 0, ?, ?, '[]', 0)`,
		id, workspace, title, top, bottom, shoes, palette, category, categories, tags, cover, now, now)
	return err
}

func insertActionAsset(ctx context.Context, tx *sql.Tx, workspace, id, now string, data map[string]any) error {
	sceneID, err := actionSceneID(data)
	if err != nil {
		return err
	}
	if text, ok := sceneID.(string); ok {
		if err := requireActionScene(ctx, tx, workspace, map[string]any{"sceneId": text}); err != nil {
			return err
		}
	}
	title, err := textOrDefault(data["title"], "新抓拍动作")
	if err != nil {
		return err
	}
	action, err := textOrDefault(data["action"], "")
	if err != nil {
		return err
	}
	shotType, err := textOrDefault(data["shotType"], "half_body")
	if err != nil {
		return err
	}
	camera, err := textOrDefault(data["camera"], "iPhone 50mm 生活镜头")
	if err != nil {
		return err
	}
	anatomy, err := jsonListOrString(data["suitableAnatomy"], []any{"all"})
	if err != nil {
		return err
	}
	tags, err := tagsText(data["tags"])
	if err != nil {
		return err
	}
	cover, err := textOrDefault(data["coverUrl"], "")
	if err != nil {
		return err
	}
	order, err := shotOrderValue(data["shotOrder"])
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "ActionAsset" (
			"id", "workspaceId", "title", "action", "shotType", "spatialType", "camera",
			"suitableAnatomy", "tags", "coverUrl", "provenance", "sceneId", "shotOrder",
			"usageCount", "isFavorite", "createdAt", "updatedAt", "productCategoryIds", "isUniversal"
		) VALUES (?, ?, ?, ?, ?, 'general', ?, ?, ?, ?, 'manual', ?, ?, 0, 0, ?, ?, '[]', 0)`,
		id, workspace, title, action, shotType, camera, anatomy, tags, cover, sceneID, order, now, now)
	return err
}

func ensureCreateRegistry(ctx context.Context, db *sql.DB, workspace, assetType, id, provenance, now string) {
	regID, err := database.NewID()
	if err != nil {
		return
	}
	_, _ = db.ExecContext(ctx, `
		INSERT INTO "PromptAssetRegistry" (
			"id", "workspaceId", "assetType", "sourceAssetId", "status", "version", "provenance",
			"sourceRef", "qualityScore", "confidence", "publishedAt", "disabledReason", "createdAt", "updatedAt"
		) VALUES (?, ?, ?, ?, 'published', 1, ?, NULL, NULL, NULL, ?, NULL, ?, ?)
		ON CONFLICT ("workspaceId", "assetType", "sourceAssetId") DO NOTHING`,
		"reg_"+regID, workspace, assetType, id, provenance, now, now, now)
}

func newLibraryID() (string, error) {
	id, err := database.NewID()
	if err != nil {
		return "", err
	}
	return "c" + id[:24], nil
}

func textOrDefault(value any, fallback string) (string, error) {
	if !createTruthy(value) {
		return fallback, nil
	}
	text, ok := value.(string)
	if !ok {
		return "", errLibraryCreateValue
	}
	return text, nil
}

func tagsText(value any) (string, error) {
	if !createTruthy(value) {
		return "", nil
	}
	switch typed := value.(type) {
	case string:
		return typed, nil
	case []any:
		parts := make([]string, len(typed))
		for i, item := range typed {
			parts[i] = fmt.Sprint(item)
		}
		return strings.Join(parts, ", "), nil
	default:
		return "", errLibraryCreateValue
	}
}

func jsonListOrString(value any, fallback any) (string, error) {
	if !createTruthy(value) {
		return marshalCreate(fallback)
	}
	if text, ok := value.(string); ok {
		return text, nil
	}
	return marshalCreate(value)
}

func actionSceneID(data map[string]any) (any, error) {
	value, ok := data["sceneId"]
	if !ok || value == nil || value == "" {
		return nil, nil
	}
	text, ok := value.(string)
	if !ok {
		return nil, LibraryUpdateError{Message: "场景 ID 必须为字符串"}
	}
	return text, nil
}

func shotOrderValue(value any) (int64, error) {
	number, ok := value.(json.Number)
	if !ok {
		return 0, nil
	}
	if strings.ContainsAny(number.String(), ".eE") {
		parsed, err := number.Float64()
		if err != nil || parsed != float64(int64(parsed)) {
			return 0, errLibraryCreateValue
		}
		return int64(parsed), nil
	}
	return number.Int64()
}

func createTruthy(value any) bool {
	switch typed := value.(type) {
	case nil:
		return false
	case string:
		return typed != ""
	case bool:
		return typed
	case json.Number:
		return typed.String() != "0"
	default:
		return true
	}
}

func marshalCreate(value any) (string, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return "", err
	}
	return string(bytes.TrimRight(buf.Bytes(), "\n")), nil
}
