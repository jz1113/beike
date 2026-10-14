package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

type LibraryExport struct {
	Scenes       []json.RawMessage
	Outfits      []json.RawMessage
	Actions      []json.RawMessage
	Personas     []json.RawMessage
	FullPrompts  []json.RawMessage
	Categories   []json.RawMessage
	Albums       []json.RawMessage
	Registries   []json.RawMessage
	Replacements []json.RawMessage
}

func ExportLibrary(ctx context.Context, db *sql.DB, workspace string) (LibraryExport, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return LibraryExport{}, err
	}
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		_ = tx.Rollback()
		return LibraryExport{}, err
	}
	if err := tx.Commit(); err != nil {
		return LibraryExport{}, err
	}
	scenes, err := queryLibraryByID(ctx, db, "SceneAsset", sceneAssetColumns, workspace)
	if err != nil {
		return LibraryExport{}, err
	}
	outfits, err := queryLibraryByID(ctx, db, "OutfitAsset", outfitAssetColumns, workspace)
	if err != nil {
		return LibraryExport{}, err
	}
	actions, err := queryLibraryByID(ctx, db, "ActionAsset", actionAssetColumns, workspace)
	if err != nil {
		return LibraryExport{}, err
	}
	personas, err := queryLibraryByID(ctx, db, "PersonaAsset", personaAssetColumns, workspace)
	if err != nil {
		return LibraryExport{}, err
	}
	prompts, err := queryLibraryByID(ctx, db, "FullPromptAsset", fullPromptAssetColumns, workspace)
	if err != nil {
		return LibraryExport{}, err
	}
	exported := map[string]map[string]struct{}{
		"scene": idSet(scenes), "outfit": idSet(outfits), "action": idSet(actions),
		"persona": idSet(personas), "full_prompt": idSet(prompts),
	}
	numbered, err := numberVisiblePrompts(ctx, db, workspace, prompts)
	if err != nil {
		return LibraryExport{}, err
	}
	categories, err := queryOrderedObjects(ctx, db, `
		SELECT "id", "name", "parentId", "position", "isArchived", "aliases", "keywords", "anatomy"
		FROM "AssetProductCategory" WHERE "workspaceId" IN (?, ?) ORDER BY "id" ASC`,
		[]any{workspace, database.OfficialWorkspace}, []exportColumn{
			{"id", colText}, {"name", colText}, {"parentId", colNullText}, {"position", colInt},
			{"isArchived", colBool}, {"aliases", colText}, {"keywords", colText}, {"anatomy", colText},
		})
	if err != nil {
		return LibraryExport{}, err
	}
	albums, err := queryOrderedObjects(ctx, db, `
		SELECT "id", "name", "sourceKey", "productCategoryId" FROM "PromptAlbum"
		WHERE "workspaceId" IN (?, ?) ORDER BY "id" ASC`,
		[]any{workspace, database.OfficialWorkspace}, []exportColumn{
			{"id", colText}, {"name", colText}, {"sourceKey", colText}, {"productCategoryId", colNullText},
		})
	if err != nil {
		return LibraryExport{}, err
	}
	registries, err := exportedRegistries(ctx, db, workspace, exported)
	if err != nil {
		return LibraryExport{}, err
	}
	replacements, err := exportedReplacements(ctx, db, workspace, exported["full_prompt"])
	if err != nil {
		return LibraryExport{}, err
	}
	return LibraryExport{
		Scenes: scenes, Outfits: outfits, Actions: actions, Personas: personas, FullPrompts: numbered,
		Categories: categories, Albums: albums, Registries: registries, Replacements: replacements,
	}, nil
}

func numberVisiblePrompts(ctx context.Context, db *sql.DB, workspace string, items []json.RawMessage) ([]json.RawMessage, error) {
	numbered := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		var fields map[string]any
		if err := json.Unmarshal(item, &fields); err != nil {
			return nil, err
		}
		var number *int64
		if promptRowVisible(fields) {
			id, _ := fields["id"].(string)
			found, err := libraryPromptNumber(ctx, db, workspace, id)
			if err != nil {
				return nil, err
			}
			number = found
		}
		numbered = append(numbered, setDisplayNumber(item, number))
	}
	return numbered, nil
}

func promptRowVisible(fields map[string]any) bool {
	provenance := libraryText(fields["provenance"])
	if provenance == "" {
		provenance = "deconstructed"
	}
	if provenance == "legacy_single" {
		return false
	}
	if provenance != "deconstructed" {
		return true
	}
	if fields["groupIndex"] != nil {
		return true
	}
	return savedPromptStructure(fields["sourceImageIndices"]) || savedPromptStructure(fields["shotPromptsJson"])
}

func savedPromptStructure(value any) bool {
	text, ok := value.(string)
	if !ok {
		list, ok := value.([]any)
		return ok && len(list) > 0
	}
	return text != "" && text != "[]" && text != "null"
}

func exportedRegistries(ctx context.Context, db *sql.DB, workspace string, exported map[string]map[string]struct{}) ([]json.RawMessage, error) {
	rows, err := queryOrderedObjects(ctx, db, `
		SELECT "id", "assetType", "sourceAssetId", "status", "version", "provenance", "sourceRef",
			"qualityScore", "confidence", "publishedAt", "disabledReason"
		FROM "PromptAssetRegistry" WHERE "workspaceId" = ? ORDER BY "id" ASC`,
		[]any{workspace}, []exportColumn{
			{"id", colText}, {"assetType", colText}, {"sourceAssetId", colText}, {"status", colText},
			{"version", colInt}, {"provenance", colText}, {"sourceRef", colNullText},
			{"qualityScore", colNullFloat}, {"confidence", colNullFloat}, {"publishedAt", colNullText},
			{"disabledReason", colNullText},
		})
	if err != nil {
		return nil, err
	}
	kept := []json.RawMessage{}
	for _, row := range rows {
		var fields map[string]any
		if err := json.Unmarshal(row, &fields); err != nil {
			return nil, err
		}
		assetType, _ := fields["assetType"].(string)
		sourceID, _ := fields["sourceAssetId"].(string)
		if _, ok := exported[assetType][sourceID]; ok {
			kept = append(kept, row)
		}
	}
	return kept, nil
}

func exportedReplacements(ctx context.Context, db *sql.DB, workspace string, mothers map[string]struct{}) ([]json.RawMessage, error) {
	rows, err := queryOrderedObjects(ctx, db, `
		SELECT "motherAssetId", "sourceSnapshotJson", "generatedImagesJson", "createdAt"
		FROM "FullPromptImageReplacement" WHERE "workspaceId" = ? ORDER BY "motherAssetId" ASC`,
		[]any{workspace}, []exportColumn{
			{"motherAssetId", colText}, {"sourceSnapshotJson", colText}, {"generatedImagesJson", colText}, {"createdAt", colText},
		})
	if err != nil {
		return nil, err
	}
	kept := []json.RawMessage{}
	for _, row := range rows {
		var fields map[string]any
		if err := json.Unmarshal(row, &fields); err != nil {
			return nil, err
		}
		id, _ := fields["motherAssetId"].(string)
		if _, ok := mothers[id]; ok {
			kept = append(kept, row)
		}
	}
	return kept, nil
}

func queryLibraryByID(ctx context.Context, db *sql.DB, table string, columns []assetColumn, workspace string) ([]json.RawMessage, error) {
	names := make([]string, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
	}
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "`+table+`"
		WHERE "workspaceId" IN (?, ?) ORDER BY "id" ASC`, workspace, database.OfficialWorkspace)
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

type exportColumn struct {
	name string
	kind columnKind
}

func queryOrderedObjects(ctx context.Context, db *sql.DB, query string, args []any, columns []exportColumn) ([]json.RawMessage, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		holders := make([]any, len(columns))
		for i, column := range columns {
			switch column.kind {
			case colInt, colNullInt, colBool, colNullFloat:
				holders[i] = new(sql.NullFloat64)
			default:
				holders[i] = new(sql.NullString)
			}
		}
		if err := rows.Scan(holders...); err != nil {
			return nil, err
		}
		fields := make([]any, 0, len(columns)*2)
		for i, column := range columns {
			fields = append(fields, column.name, exportValue(column.kind, holders[i]))
		}
		item, err := orderedJSON(fields)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func exportValue(kind columnKind, holder any) any {
	switch kind {
	case colBool:
		value := holder.(*sql.NullFloat64)
		if !value.Valid {
			return nil
		}
		return value.Float64 != 0
	case colInt:
		value := holder.(*sql.NullFloat64)
		if !value.Valid {
			return nil
		}
		return int64(value.Float64)
	case colNullFloat:
		value := holder.(*sql.NullFloat64)
		if !value.Valid {
			return nil
		}
		return value.Float64
	default:
		value := holder.(*sql.NullString)
		if !value.Valid {
			return nil
		}
		return value.String
	}
}

func idSet(items []json.RawMessage) map[string]struct{} {
	ids := map[string]struct{}{}
	for _, item := range items {
		var fields map[string]any
		if json.Unmarshal(item, &fields) != nil {
			continue
		}
		id, _ := fields["id"].(string)
		if id != "" {
			ids[id] = struct{}{}
		}
	}
	return ids
}
