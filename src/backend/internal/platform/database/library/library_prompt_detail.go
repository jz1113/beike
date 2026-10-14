package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"regexp"
	"strings"
)

func LibraryPromptDetail(ctx context.Context, db *sql.DB, workspace, id string) (json.RawMessage, error) {
	item, err := loadSharedLibraryItem(ctx, db, "FullPromptAsset", fullPromptAssetColumns, id, workspace)
	if err == sql.ErrNoRows {
		return nil, ErrLibraryDetailMissing
	}
	if err != nil {
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	number, err := libraryPromptNumber(ctx, db, workspace, id)
	if err != nil {
		return nil, err
	}
	registry, status, registryID, sourceRef, registryProvenance, err := promptRegistry(ctx, db, workspace, id)
	if err != nil {
		registry, status, registryID, sourceRef, registryProvenance = nil, "", "", "", ""
	}
	eligible, reason := libraryProduction("full_prompt", fields, status)
	replaced, err := promptImageReplaced(ctx, db, workspace, id, fields)
	if err != nil {
		return nil, err
	}
	mother, err := promptSourceMother(ctx, db, workspace, registryID, sourceRef, registryProvenance)
	if err != nil {
		return nil, err
	}
	extra := []any{}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason,
		"imageReplaced", replaced, "imageReplaceable", promptImageReplaceable(fields, replaced), "sourceMother", mother)
	body, err := extendJSON(item, extra)
	if err != nil {
		return nil, err
	}
	return setDisplayNumber(body, number), nil
}

func libraryPromptNumber(ctx context.Context, db *sql.DB, workspace, id string) (*int64, error) {
	var number int64
	err := db.QueryRowContext(ctx, `
		SELECT "displayNumber" FROM "FullPromptLibraryNumber"
		WHERE "workspaceId" = ? AND "assetId" = ?`, workspace, id).Scan(&number)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &number, nil
}

func promptRegistry(ctx context.Context, db *sql.DB, workspace, id string) (json.RawMessage, string, string, string, string, error) {
	body, status, err := libraryRegistry(ctx, db, workspace, "full_prompt", id)
	if err != nil || body == nil {
		return body, status, "", "", "", err
	}
	var fields map[string]any
	if err := json.Unmarshal(body, &fields); err != nil {
		return nil, "", "", "", "", err
	}
	registryID, _ := fields["id"].(string)
	sourceRef, _ := fields["sourceRef"].(string)
	provenance, _ := fields["provenance"].(string)
	return body, status, registryID, sourceRef, provenance, nil
}

func promptImageReplaced(ctx context.Context, db *sql.DB, workspace, id string, fields map[string]any) (bool, error) {
	if libraryText(fields["provenance"]) == "workshop_generated" || fields["groupIndex"] == nil {
		return false, nil
	}
	var found string
	err := db.QueryRowContext(ctx, `
		SELECT "motherAssetId" FROM "FullPromptImageReplacement"
		WHERE "workspaceId" = ? AND "motherAssetId" = ?`, workspace, id).Scan(&found)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func promptImageReplaceable(fields map[string]any, replaced bool) bool {
	return fields["groupIndex"] != nil && libraryText(fields["provenance"]) != "workshop_generated" && !replaced
}

func promptSourceMother(ctx context.Context, db *sql.DB, workspace, registryID, sourceRef, provenance string) (any, error) {
	if provenance != "workshop_generated" || sourceRef == "" || sourceRef == registryID {
		return nil, nil
	}
	var assetID, title, album sql.NullString
	var group sql.NullInt64
	var available int
	err := db.QueryRowContext(ctx, `
		SELECT registry."sourceAssetId", parent."title", parent."groupIndex", parent."albumName",
			CASE WHEN parent."id" IS NULL THEN 0 ELSE 1 END
		FROM "PromptAssetRegistry" AS registry
		LEFT JOIN "FullPromptAsset" AS parent
			ON parent."id" = registry."sourceAssetId" AND parent."workspaceId" IN (?, ?)
		WHERE registry."workspaceId" = ? AND registry."assetType" = 'full_prompt' AND registry."id" = ?`,
		workspace, database.OfficialWorkspace, workspace, sourceRef).Scan(&assetID, &title, &group, &album, &available)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	number, err := libraryPromptNumber(ctx, db, workspace, assetID.String)
	if err != nil {
		return nil, err
	}
	var groupValue any
	if group.Valid {
		groupValue = group.Int64
	}
	var albumValue any
	if album.Valid {
		albumValue = album.String
	}
	body, err := orderedJSON([]any{
		"id", assetID.String, "code", stablePromptCode(assetID.String), "title", nullString(title),
		"displayNumber", number, "groupIndex", groupValue, "albumName", albumValue, "available", available == 1,
	})
	if err != nil {
		return nil, err
	}
	return body, nil
}

func completePromptGroup(fields map[string]any) bool {
	indices := uniquePositiveInts(fields["sourceImageIndices"])
	shots := promptShotMarks(fields["shotPromptsJson"])
	if len(indices) != 4 || len(shots) != 4 {
		return false
	}
	seen := map[int]struct{}{}
	for _, shot := range shots {
		if shot.text == "" {
			return false
		}
		seen[shot.number] = struct{}{}
	}
	return len(seen) == 4
}

func uniquePositiveInts(value any) []int {
	list := jsonList(value)
	seen := map[int]struct{}{}
	values := []int{}
	for _, item := range list {
		number, ok := item.(float64)
		if !ok || number != float64(int(number)) || number <= 0 {
			return nil
		}
		seen[int(number)] = struct{}{}
		values = append(values, int(number))
	}
	if len(seen) != len(values) {
		return nil
	}
	return values
}

type promptShotMark struct {
	number int
	text   string
}

func promptShotMarks(value any) []promptShotMark {
	list := jsonList(value)
	shots := []promptShotMark{}
	for index, item := range list {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		number := index + 1
		if raw, ok := object["shot_no"].(float64); ok && raw != 0 {
			number = int(raw)
		}
		text := strings.TrimSpace(libraryText(object["prompt"]) + libraryText(object["action"]) + libraryText(object["scene"]))
		shots = append(shots, promptShotMark{number: number, text: text})
	}
	return shots
}

func jsonList(value any) []any {
	var parsed any
	switch typed := value.(type) {
	case string:
		if json.Unmarshal([]byte(typed), &parsed) != nil {
			return nil
		}
	default:
		parsed = value
	}
	list, _ := parsed.([]any)
	return list
}

func stablePromptCode(id string) string {
	compact := nonAlnumPattern.ReplaceAllString(id, "")
	if len(compact) > 4 {
		compact = compact[len(compact)-4:]
	}
	if compact == "" {
		compact = "0000"
	}
	return "R-" + strings.ToLower(compact)
}

func nullString(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

var nonAlnumPattern = regexp.MustCompile(`[^a-zA-Z0-9]`)
