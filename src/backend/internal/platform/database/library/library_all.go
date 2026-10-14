package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"strings"
)

type LibraryAll struct {
	Page        int
	HasMore     bool
	Scenes      []json.RawMessage
	Outfits     []json.RawMessage
	Actions     []json.RawMessage
	Personas    []json.RawMessage
	FullPrompts []json.RawMessage
}

func ListAllLibraryAssets(ctx context.Context, db *sql.DB, workspace string, page int, slim bool) (LibraryAll, error) {
	scenes, err := listAllScenes(ctx, db, workspace, page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	outfits, err := listAllSimple(ctx, db, workspace, "outfit", page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	actions, err := listAllSimple(ctx, db, workspace, "action", page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	personas, err := listAllSimple(ctx, db, workspace, "persona", page, slim)
	if err != nil {
		return LibraryAll{}, err
	}
	prompts, err := listPromptGroups(ctx, db, workspace, page, 1000, "", false, "", "", true, "")
	if err != nil {
		return LibraryAll{}, err
	}
	fullPrompts := prompts.Items
	if slim {
		fullPrompts, err = slimPromptItems(fullPrompts)
		if err != nil {
			return LibraryAll{}, err
		}
	}
	result := LibraryAll{Page: page, Scenes: scenes, Outfits: outfits, Actions: actions, Personas: personas, FullPrompts: fullPrompts}
	result.HasMore = len(scenes) == 1000 || len(outfits) == 1000 || len(actions) == 1000 || len(personas) == 1000 || len(fullPrompts) == 1000
	return result, nil
}

func listAllScenes(ctx context.Context, db *sql.DB, workspace string, page int, slim bool) ([]json.RawMessage, error) {
	rows, err := queryLibraryPage(ctx, db, "SceneAsset", sceneAssetColumns, workspace, page)
	if err != nil {
		return nil, err
	}
	items := []json.RawMessage{}
	for _, item := range rows {
		body, err := decorateAllScene(ctx, db, workspace, item)
		if err != nil {
			return nil, err
		}
		if slim {
			body, err = slimLibraryItem(body, []string{"shotCount", "spatialType", "lighting", "description", "sceneSourceKey"})
			if err != nil {
				return nil, err
			}
		}
		items = append(items, body)
	}
	return items, nil
}

func decorateAllScene(ctx context.Context, db *sql.DB, workspace string, item json.RawMessage) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	id, _ := fields["id"].(string)
	extra := []any{"code", stableAssetCode("S", id)}
	if source, ok := fields["sourceImages"].(string); ok && source != "" {
		sum := sha256.Sum256([]byte(source))
		extra = append(extra, "sceneSourceKey", hex.EncodeToString(sum[:])[:16])
	}
	actions, err := listSceneActions(ctx, db, workspace, id, 4)
	if err != nil {
		return nil, err
	}
	registry, status, err := libraryRegistry(ctx, db, workspace, "scene", id)
	if err != nil {
		registry, status = nil, ""
	}
	eligible, reason := libraryProduction("scene", fields, status)
	extra = append([]any{"actions", actions}, extra...)
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	shots := sceneDetailShots(id, item, actions)
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason, "shots", shots, "shotCount", len(shots))
	return extendJSON(item, extra)
}

func listAllSimple(ctx context.Context, db *sql.DB, workspace, assetType string, page int, slim bool) ([]json.RawMessage, error) {
	table, columns, prefix, _, ok := libraryListTarget(assetType)
	if !ok {
		return nil, nil
	}
	rows, err := queryLibraryPage(ctx, db, table, columns, workspace, page)
	if err != nil {
		return nil, err
	}
	items := []json.RawMessage{}
	for _, item := range rows {
		body, err := decorateAllSimple(ctx, db, workspace, assetType, prefix, item)
		if err != nil {
			return nil, err
		}
		if slim {
			extra := []string{}
			if assetType == "action" {
				extra = []string{"action", "camera"}
			}
			if assetType == "persona" {
				extra = []string{"description"}
			}
			body, err = slimLibraryItem(body, extra)
			if err != nil {
				return nil, err
			}
		}
		items = append(items, body)
	}
	return items, nil
}

func decorateAllSimple(ctx context.Context, db *sql.DB, workspace, assetType, prefix string, item json.RawMessage) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	id, _ := fields["id"].(string)
	registry, status, err := libraryRegistry(ctx, db, workspace, assetType, id)
	if err != nil {
		registry, status = nil, ""
	}
	eligible, reason := libraryProduction(assetType, fields, status)
	extra := []any{}
	if registry != nil {
		extra = append(extra, "registry", registry)
	}
	extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason, "code", stableAssetCode(prefix, id))
	if assetType == "outfit" || assetType == "persona" {
		extra = append(extra, "appearanceAudience", appearanceAudience(fields, assetType == "outfit"))
	}
	return extendJSON(item, extra)
}

func queryLibraryPage(ctx context.Context, db *sql.DB, table string, columns []assetColumn, workspace string, page int) ([]json.RawMessage, error) {
	names := make([]string, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
	}
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "`+table+`"
		WHERE "workspaceId" IN (?, ?)
		ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC
		LIMIT 1000 OFFSET ?`, workspace, database.OfficialWorkspace, (page-1)*1000)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		item, err := scanLibraryRow(columns, rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func slimPromptItems(items []json.RawMessage) ([]json.RawMessage, error) {
	slimmed := []json.RawMessage{}
	for _, item := range items {
		body, err := slimLibraryItem(item, []string{
			"albumName", "productCategoryIds", "productSubcategory", "isUniversal", "sceneSummary", "outfitSummary",
			"actionSummary", "personaSummary", "sourceImageIndex", "sourceImageIndices", "groupIndex", "displayNumber",
			"contentSummary", "architectureSummary", "replaceableSlots", "shotPromptsJson", "hasHuman", "provenance",
			"sourceMother", "imageReplaced", "imageReplaceable",
		})
		if err != nil {
			return nil, err
		}
		var fields map[string]any
		if err := json.Unmarshal(item, &fields); err != nil {
			return nil, err
		}
		if preview := promptPreview(libraryText(fields["reversePromptZh"])); preview != "" {
			body, err = extendJSON(body, []any{"promptPreview", preview})
			if err != nil {
				return nil, err
			}
		}
		slimmed = append(slimmed, body)
	}
	return slimmed, nil
}

func promptPreview(text string) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) == 0 {
		return ""
	}
	if len(runes) > 80 {
		return string(runes[:80])
	}
	return text
}

func slimLibraryItem(item json.RawMessage, extra []string) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	if fields["title"] == nil {
		if name := fields["name"]; name != nil {
			fields["title"] = name
		}
	}
	if fields["coverUrl"] == nil {
		if avatar := fields["avatarUrl"]; avatar != nil {
			fields["coverUrl"] = avatar
		}
	}
	keys := append([]string{
		"id", "title", "name", "tags", "dimensions", "appearanceAudience", "category", "isFavorite", "usageCount",
		"createdAt", "updatedAt", "code", "coverUrl", "suitableAnatomy", "shotType", "albumName", "registry",
		"provenance", "contentEligible", "productionBlockReason",
	}, extra...)
	ordered := []any{}
	seen := map[string]struct{}{}
	for _, key := range keys {
		if _, ok := seen[key]; ok {
			continue
		}
		value, ok := fields[key]
		if !ok || value == nil {
			continue
		}
		seen[key] = struct{}{}
		ordered = append(ordered, key, value)
	}
	if len(ordered) == 0 {
		return json.RawMessage(`{}`), nil
	}
	return orderedJSON(ordered)
}
