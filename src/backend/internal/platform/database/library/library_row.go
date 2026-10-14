package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

type columnKind int

const (
	colText columnKind = iota
	colNullText
	colInt
	colNullInt
	colBool
	colNullFloat
)

type assetColumn struct {
	name string
	kind columnKind
}

type rowQuery interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func loadLibraryItem(ctx context.Context, q rowQuery, table string, columns []assetColumn, id, workspace string) (json.RawMessage, error) {
	return loadScopedLibraryItem(ctx, q, table, columns, id, `"workspaceId" = ?`, []any{id, workspace})
}

func loadSharedLibraryItem(ctx context.Context, q rowQuery, table string, columns []assetColumn, id, workspace string) (json.RawMessage, error) {
	return loadScopedLibraryItem(ctx, q, table, columns, id, `"workspaceId" IN (?, ?)`, []any{id, workspace, database.OfficialWorkspace})
}

func loadScopedLibraryItem(ctx context.Context, q rowQuery, table string, columns []assetColumn, id, where string, args []any) (json.RawMessage, error) {
	names := make([]string, len(columns))
	holders := make([]any, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
		switch column.kind {
		case colInt, colNullInt, colBool:
			holders[i] = new(sql.NullInt64)
		default:
			holders[i] = new(sql.NullString)
		}
	}
	query := `SELECT ` + strings.Join(names, ", ") + ` FROM "` + table + `" WHERE "id" = ? AND ` + where
	if err := q.QueryRowContext(ctx, query, args...).Scan(holders...); err != nil {
		return nil, err
	}
	fields := make([]any, 0, len(columns)*2)
	for i, column := range columns {
		fields = append(fields, column.name, columnJSON(column.kind, holders[i]))
	}
	return orderedJSON(fields)
}

func columnJSON(kind columnKind, holder any) any {
	switch kind {
	case colBool:
		value := holder.(*sql.NullInt64)
		if !value.Valid {
			return nil
		}
		return value.Int64 != 0
	case colInt, colNullInt:
		value := holder.(*sql.NullInt64)
		if !value.Valid {
			return nil
		}
		return value.Int64
	default:
		value := holder.(*sql.NullString)
		if !value.Valid {
			return nil
		}
		return value.String
	}
}

func orderedJSON(fields []any) (json.RawMessage, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i := 0; i < len(fields); i += 2 {
		if i > 0 {
			buf.WriteByte(',')
		}
		key, err := json.Marshal(fields[i])
		if err != nil {
			return nil, err
		}
		var value bytes.Buffer
		encoder := json.NewEncoder(&value)
		encoder.SetEscapeHTML(false)
		if err := encoder.Encode(fields[i+1]); err != nil {
			return nil, err
		}
		buf.Write(key)
		buf.WriteByte(':')
		buf.Write(bytes.TrimRight(value.Bytes(), "\n"))
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

func textColumn(name string) assetColumn { return assetColumn{name, colText} }
func nullColumn(name string) assetColumn { return assetColumn{name, colNullText} }
func intColumn(name string) assetColumn  { return assetColumn{name, colInt} }
func nullIntColumn(name string) assetColumn {
	return assetColumn{name, colNullInt}
}
func boolColumn(name string) assetColumn { return assetColumn{name, colBool} }

var sceneAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), textColumn("description"),
	textColumn("lighting"), textColumn("category"), textColumn("spatialType"), textColumn("suitableCategories"),
	textColumn("tags"), nullColumn("coverUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"),
	nullColumn("dimensions"), nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"),
	intColumn("usageCount"), boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"),
	nullColumn("albumId"), textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var outfitAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), textColumn("top"), textColumn("bottom"),
	nullColumn("shoes"), nullColumn("colorPalette"), textColumn("category"), textColumn("suitableCategories"),
	textColumn("tags"), nullColumn("coverUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"),
	nullColumn("dimensions"), nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"),
	intColumn("usageCount"), boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"),
	nullColumn("albumId"), textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var actionAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), textColumn("action"), textColumn("shotType"),
	textColumn("spatialType"), nullColumn("camera"), textColumn("suitableAnatomy"), textColumn("tags"),
	nullColumn("coverUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"), nullColumn("dimensions"),
	nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"), nullColumn("sceneId"),
	intColumn("shotOrder"), intColumn("usageCount"), boolColumn("isFavorite"), textColumn("createdAt"),
	textColumn("updatedAt"), nullColumn("albumId"), textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var personaAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("name"), textColumn("description"), textColumn("tags"),
	nullColumn("avatarUrl"), nullColumn("sourceImages"), nullColumn("reversePrompt"), nullColumn("dimensions"),
	nullIntColumn("sourceImageIndex"), nullColumn("imageType"), textColumn("provenance"), intColumn("usageCount"),
	boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"), nullColumn("albumId"),
	textColumn("productCategoryIds"), boolColumn("isUniversal"),
}

var fullPromptAssetColumns = []assetColumn{
	textColumn("id"), textColumn("workspaceId"), textColumn("title"), nullColumn("albumName"),
	textColumn("reversePromptZh"), nullColumn("reversePromptEn"), nullColumn("dimensions"), nullColumn("imageType"),
	nullIntColumn("sourceImageIndex"), nullColumn("sourceImageIndices"), nullIntColumn("groupIndex"),
	nullIntColumn("displayNumber"), nullColumn("contentSummary"), nullColumn("architectureSummary"),
	nullColumn("replaceableSlots"), nullColumn("shotPromptsJson"), nullColumn("coverUrl"), nullColumn("sourceImages"),
	boolColumn("hasHuman"), nullColumn("shotFraming"), nullIntColumn("productFrameRatio"), nullColumn("sceneSummary"),
	nullColumn("outfitSummary"), nullColumn("actionSummary"), nullColumn("personaSummary"), textColumn("tags"),
	textColumn("category"), nullColumn("productSubcategory"), textColumn("provenance"), intColumn("usageCount"),
	boolColumn("isFavorite"), textColumn("createdAt"), textColumn("updatedAt"), nullColumn("albumId"),
	textColumn("productCategoryIds"), boolColumn("isUniversal"),
}
