package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

func createFullPromptAsset(ctx context.Context, db *sql.DB, workspace string, data map[string]any) (json.RawMessage, error) {
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
	if value, ok := data["productCategoryIds"]; ok {
		if message := validCategoryList(value); message != "" {
			return nil, LibraryFailure{Message: message}
		}
	}
	if value, ok := data["isUniversal"]; ok {
		if _, ok := value.(bool); !ok {
			return nil, LibraryFailure{Message: "通用标记必须为布尔值"}
		}
	}
	album, err := ensurePromptAlbum(ctx, tx, workspace, data)
	if err != nil {
		return nil, err
	}
	inferred := inferCreateSubcategory(data)
	categoryID, err := promptCreateCategory(ctx, tx, workspace, data, album, inferred)
	if err != nil {
		return nil, err
	}
	subcategory, err := promptCreateSubcategory(ctx, tx, workspace, data, categoryID, inferred)
	if err != nil {
		return nil, err
	}
	if !sameStoredCategory(album.category, categoryID) {
		if err := asLibraryUpdateError(assignAlbumCategory(ctx, tx, workspace, album.id, categoryID)); err != nil {
			return nil, err
		}
	}
	number, err := nextPromptDisplayNumber(ctx, tx)
	if err != nil {
		return nil, err
	}
	id, err := newLibraryID()
	if err != nil {
		return nil, err
	}
	now := timeNow()
	provenance, err := insertFullPrompt(ctx, tx, workspace, id, now, number, album, categoryID, subcategory, data)
	if err != nil {
		return nil, err
	}
	visible := promptCreateVisible(provenance)
	var publicNumber *int64
	if visible {
		assigned, err := assignVisiblePromptNumbers(ctx, tx, workspace, id)
		if err != nil {
			return nil, err
		}
		publicNumber = &assigned
	}
	item, err := loadLibraryItem(ctx, tx, "FullPromptAsset", fullPromptAssetColumns, id, workspace)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	committed = true
	ensureCreateRegistry(ctx, db, workspace, "full_prompt", id, provenance, now)
	return setDisplayNumber(item, publicNumber), nil
}

type storedAlbum struct {
	id, name string
	category sql.NullString
}

func ensurePromptAlbum(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any) (storedAlbum, error) {
	if createTruthy(data["albumId"]) {
		var album storedAlbum
		err := tx.QueryRowContext(ctx, `
			SELECT "id", "name", "productCategoryId" FROM "PromptAlbum"
			WHERE "id" = ? AND "workspaceId" IN (?, ?)`, fmt.Sprint(data["albumId"]), workspace, officialWorkspace).Scan(&album.id, &album.name, &album.category)
		if err == sql.ErrNoRows {
			return storedAlbum{}, LibraryFailure{Message: "请求的资源不存在"}
		}
		return album, err
	}
	ids := []string{}
	if text, ok := data["productCategoryIds"].(string); ok {
		ids = categoryIDList(text)
	}
	if len(ids) > 1 {
		return storedAlbum{}, LibraryFailure{Message: "完整提示词只能归属一个商品品类"}
	}
	if err := requirePersonaCategories(ctx, tx, workspace, ids); err != nil {
		return storedAlbum{}, err
	}
	name := "未命名图集"
	if text, ok := data["albumName"].(string); ok && strings.TrimSpace(text) != "" {
		name = strings.TrimSpace(text)
	}
	fallback, err := newLibraryID()
	if err != nil {
		return storedAlbum{}, err
	}
	key := albumSourceKey(name, data["sourceImages"], fallback)
	var category any
	if len(ids) == 1 {
		category = ids[0]
	}
	albumID, err := newLibraryID()
	if err != nil {
		return storedAlbum{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "PromptAlbum" ("id", "workspaceId", "name", "sourceKey", "productCategoryId", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT ("workspaceId", "sourceKey") DO NOTHING`,
		albumID, workspace, name, key, category, timeNow()); err != nil {
		return storedAlbum{}, err
	}
	var album storedAlbum
	err = tx.QueryRowContext(ctx, `
		SELECT "id", "name", "productCategoryId" FROM "PromptAlbum"
		WHERE "workspaceId" = ? AND "sourceKey" = ?`, workspace, key).Scan(&album.id, &album.name, &album.category)
	return album, err
}

func promptCreateCategory(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any, album storedAlbum, inferred string) (*string, error) {
	if _, explicit := data["productCategoryIds"]; explicit {
		text, ok := data["productCategoryIds"].(string)
		if !ok {
			return nil, LibraryUpdateError{Message: "商品大类必须为 JSON 数组"}
		}
		categoryID, err := oneMajorCategory(text)
		if err != nil {
			return nil, err
		}
		resolved, err := resolveMajorCategory(ctx, tx, workspace, categoryID)
		return resolved, asLibraryUpdateError(err)
	}
	if album.category.Valid && album.category.String != "" {
		categoryID := album.category.String
		return &categoryID, nil
	}
	if builtinSubcategory(inferred) {
		digital := "digital_3c"
		resolved, err := resolveMajorCategory(ctx, tx, workspace, &digital)
		return resolved, asLibraryUpdateError(err)
	}
	return nil, nil
}

func promptCreateSubcategory(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any, categoryID *string, inferred string) (any, error) {
	_, explicit := data["productSubcategory"]
	archived := false
	if !explicit && builtinSubcategory(inferred) {
		var flag int
		err := tx.QueryRowContext(ctx, `
			SELECT "isArchived" FROM "AssetProductCategory"
			WHERE "id" = ? AND "workspaceId" IN (?, ?)`, builtinFolderID(inferred), workspace, officialWorkspace).Scan(&flag)
		archived = err == nil && flag != 0
	}
	var value any
	if !archived && (((categoryID != nil && *categoryID == "digital_3c") || explicit) && inferred != "") {
		value = inferred
	}
	return normalizePromptSubcategory(ctx, tx, workspace, categoryID, value)
}

func sameStoredCategory(current sql.NullString, next *string) bool {
	if !current.Valid {
		return next == nil
	}
	if next == nil {
		return false
	}
	return current.String == *next
}

func nextPromptDisplayNumber(ctx context.Context, tx *sql.Tx) (int64, error) {
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES ('full_prompt', 1)
		ON CONFLICT ("id") DO UPDATE SET "lastNumber" = MAX(
			"lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0)
		) + 1`); err != nil {
		return 0, err
	}
	var number int64
	if err := tx.QueryRowContext(ctx, `SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = 'full_prompt'`).Scan(&number); err != nil {
		return 0, err
	}
	if number < 1 {
		return 0, LibraryFailure{Message: "图组展示编号分配失败"}
	}
	return number, nil
}

func promptCreateVisible(provenance string) bool {
	return provenance != "legacy_single" && provenance != "deconstructed"
}

func assignVisiblePromptNumbers(ctx context.Context, tx *sql.Tx, workspace, id string) (int64, error) {
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		return 0, err
	}
	var number int64
	err := tx.QueryRowContext(ctx, `
		SELECT "displayNumber" FROM "FullPromptLibraryNumber"
		WHERE "workspaceId" = ? AND "assetId" = ?`, workspace, id).Scan(&number)
	return number, err
}

func ensureVisiblePromptNumbers(ctx context.Context, tx *sql.Tx, workspace string) error {
	sequenceID := "library:" + workspace
	if _, err := tx.ExecContext(ctx, `
		INSERT OR IGNORE INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES (?, 0)`, sequenceID); err != nil {
		return err
	}
	var start int64
	if err := tx.QueryRowContext(ctx, `SELECT MAX(
		(SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = ?),
		COALESCE((SELECT MAX("displayNumber") FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?), 0)
	)`, sequenceID, workspace).Scan(&start); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "FullPromptLibraryNumber" ("workspaceId", "assetId", "displayNumber", "legacyDisplayNumber")
		SELECT ?, "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) + ?, "displayNumber"
		FROM "FullPromptAsset"
		WHERE "workspaceId" IN (?, ?) AND `+visiblePromptSQL+`
		  AND NOT EXISTS (SELECT 1 FROM "FullPromptLibraryNumber" AS n
			WHERE n."workspaceId" = ? AND n."assetId" = "FullPromptAsset"."id")`,
		workspace, start, workspace, officialWorkspace, workspace); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		UPDATE "FullPromptDisplaySequence" SET "lastNumber" = MAX(
			"lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?), 0)
		) WHERE "id" = ?`, workspace, sequenceID)
	return err
}

const visiblePromptSQL = `("provenance" <> 'legacy_single' AND ("groupIndex" IS NOT NULL OR "provenance" <> 'deconstructed' OR ("sourceImageIndices" IS NOT NULL AND "sourceImageIndices" NOT IN ('', '[]', 'null')) OR ("shotPromptsJson" IS NOT NULL AND "shotPromptsJson" NOT IN ('', '[]', 'null'))))`

func setDisplayNumber(item json.RawMessage, number *int64) json.RawMessage {
	const key = `"displayNumber":`
	raw := string(item)
	start := strings.Index(raw, key)
	if start < 0 {
		return item
	}
	valueStart := start + len(key)
	end := valueStart
	for end < len(raw) && raw[end] != ',' && raw[end] != '}' {
		end++
	}
	replacement := "null"
	if number != nil {
		replacement = strconv.FormatInt(*number, 10)
	}
	return json.RawMessage(raw[:valueStart] + replacement + raw[end:])
}

func albumSourceKey(name string, raw any, fallback string) string {
	sources := uniqueSourceURLs(raw)
	sort.Strings(sources)
	var payload any
	if len(sources) > 0 && strings.TrimSpace(name) != "" {
		payload = []any{strings.TrimSpace(name), sources}
	} else {
		payload = []any{"single", fallback}
	}
	body, _ := json.Marshal(payload)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func uniqueSourceURLs(raw any) []string {
	var parsed any
	switch typed := raw.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return nil
		}
	default:
		parsed = raw
	}
	list, ok := parsed.([]any)
	if !ok {
		return nil
	}
	seen := map[string]struct{}{}
	values := []string{}
	for _, item := range list {
		text, ok := item.(string)
		text = strings.TrimSpace(text)
		if !ok || text == "" {
			continue
		}
		if _, exists := seen[text]; exists {
			continue
		}
		seen[text] = struct{}{}
		values = append(values, text)
	}
	return values
}

func timeNow() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}
