package library

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

type LibraryList struct {
	Total    int
	Page     int
	PageSize int
	Items    []json.RawMessage
}

func ListLibraryAssets(ctx context.Context, db *sql.DB, workspace, assetType string, page, pageSize int, keyword string, favorite bool, albumID, categoryID string, includeUniversal bool, style string) (LibraryList, error) {
	if assetType == "full_prompt" {
		return listPromptGroups(ctx, db, workspace, page, pageSize, keyword, favorite, albumID, categoryID, includeUniversal, style)
	}
	table, columns, codePrefix, keywordFields, ok := libraryListTarget(assetType)
	if !ok {
		return LibraryList{}, fmt.Errorf("unsupported list")
	}
	where, args, err := libraryListWhere(ctx, db, workspace, keyword, favorite, albumID, categoryID, includeUniversal, keywordFields, assetType, style)
	if err != nil {
		return LibraryList{}, err
	}
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "`+table+`" WHERE `+where, args...).Scan(&total); err != nil {
		return LibraryList{}, err
	}
	names := make([]string, len(columns))
	for i, column := range columns {
		names[i] = `"` + column.name + `"`
	}
	listArgs := append(append([]any{}, args...), pageSize, (page-1)*pageSize)
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "`+table+`"
		WHERE `+where+`
		ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC
		LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return LibraryList{}, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		item, err := scanLibraryRow(columns, rows)
		if err != nil {
			return LibraryList{}, err
		}
		var fields map[string]any
		if err := json.Unmarshal(item, &fields); err != nil {
			return LibraryList{}, err
		}
		id, _ := fields["id"].(string)
		extra := []any{"code", stableAssetCode(codePrefix, id)}
		if assetType == "scene" || assetType == "scene_bundle" {
			if source, ok := fields["sourceImages"].(string); ok && source != "" {
				sum := sha256.Sum256([]byte(source))
				extra = append(extra, "sceneSourceKey", hex.EncodeToString(sum[:])[:16])
			}
		}
		registryType := assetType
		if assetType == "scene_bundle" {
			registryType = "scene"
		}
		registry, status, err := libraryRegistry(ctx, db, workspace, registryType, id)
		if err != nil {
			registry, status = nil, ""
		}
		eligible, reason := libraryProduction(registryType, fields, status)
		if registry != nil {
			extra = append(extra, "registry", registry)
		}
		extra = append(extra, "contentEligible", eligible, "productionBlockReason", reason)
		if assetType == "scene_bundle" {
			actions, err := listSceneActions(ctx, db, workspace, id, 4)
			if err != nil {
				return LibraryList{}, err
			}
			shots := sceneDetailShots(id, item, actions)
			extra = append(extra, "shots", shots, "shotCount", len(shots))
		}
		body, err := extendJSON(item, extra)
		if err != nil {
			return LibraryList{}, err
		}
		items = append(items, body)
	}
	if err := rows.Err(); err != nil {
		return LibraryList{}, err
	}
	return LibraryList{Total: total, Page: page, PageSize: pageSize, Items: items}, nil
}

func libraryListTarget(assetType string) (string, []assetColumn, string, []string, bool) {
	switch assetType {
	case "scene", "scene_bundle":
		return "SceneAsset", sceneAssetColumns, "S", []string{"title", "description", "reversePrompt", "tags"}, true
	case "outfit":
		return "OutfitAsset", outfitAssetColumns, "O", []string{"title", "top", "bottom", "reversePrompt", "tags"}, true
	case "action":
		return "ActionAsset", actionAssetColumns, "A", []string{"title", "action", "reversePrompt", "tags"}, true
	case "persona":
		return "PersonaAsset", personaAssetColumns, "P", []string{"name", "description", "reversePrompt", "tags"}, true
	default:
		return "", nil, "", nil, false
	}
}

func libraryListWhere(ctx context.Context, db *sql.DB, workspace, keyword string, favorite bool, albumID, categoryID string, includeUniversal bool, keywordFields []string, assetType, style string) (string, []any, error) {
	clauses := []string{`"workspaceId" IN (?, ?)`}
	args := []any{workspace, database.OfficialWorkspace}
	if favorite {
		clauses = append(clauses, `"isFavorite" = 1`)
	}
	if albumID != "" {
		clauses = append(clauses, `"albumId" = ?`)
		args = append(args, albumID)
	}
	if keyword != "" {
		likes := make([]string, 0, len(keywordFields))
		pattern := "%" + database.EscapeLike(keyword) + "%"
		for _, field := range keywordFields {
			likes = append(likes, `"`+field+`" LIKE ? ESCAPE '\'`)
			args = append(args, pattern)
		}
		clauses = append(clauses, "("+strings.Join(likes, " OR ")+")")
	}
	if style != "" && style != "all" {
		matches := styleCategoryMatches(assetType, style)
		parts := make([]string, 0, len(matches))
		for _, match := range matches {
			if !styleColumn(match.field) {
				continue
			}
			if match.exact {
				parts = append(parts, `"`+match.field+`" = ?`)
				args = append(args, match.text)
				continue
			}
			parts = append(parts, `"`+match.field+`" LIKE ? ESCAPE '\'`)
			args = append(args, "%"+database.EscapeLike(match.text)+"%")
		}
		if len(parts) > 0 {
			clauses = append(clauses, "("+strings.Join(parts, " OR ")+")")
		}
	}
	if categoryID != "" && categoryID != "all" {
		clause, clauseArgs, err := productCategoryClause(ctx, db, workspace, categoryID, includeUniversal)
		if err != nil {
			return "", nil, err
		}
		clauses = append(clauses, clause)
		args = append(args, clauseArgs...)
	}
	return strings.Join(clauses, " AND "), args, nil
}

func productCategoryClause(ctx context.Context, db *sql.DB, workspace, categoryID string, includeUniversal bool) (string, []any, error) {
	if categoryID == "unclassified" {
		return `("productCategoryIds" = '[]' AND "isUniversal" = 0)`, nil, nil
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id" FROM "AssetProductCategory"
		WHERE "workspaceId" IN (?, ?) AND "parentId" = ?`, workspace, database.OfficialWorkspace, categoryID)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()
	ids := []string{categoryID}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	parts := make([]string, 0, len(ids)+1)
	args := make([]any, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, `"productCategoryIds" LIKE ? ESCAPE '\'`)
		args = append(args, "%"+database.EscapeLike(jsonString(id))+"%")
	}
	if includeUniversal {
		parts = append(parts, `"isUniversal" = 1`)
	}
	return "(" + strings.Join(parts, " OR ") + ")", args, nil
}

func scanLibraryRow(columns []assetColumn, rows *sql.Rows) (json.RawMessage, error) {
	holders := make([]any, len(columns))
	for i, column := range columns {
		switch column.kind {
		case colInt, colNullInt, colBool:
			holders[i] = new(sql.NullInt64)
		default:
			holders[i] = new(sql.NullString)
		}
	}
	if err := rows.Scan(holders...); err != nil {
		return nil, err
	}
	fields := make([]any, 0, len(columns)*2)
	for i, column := range columns {
		fields = append(fields, column.name, columnJSON(column.kind, holders[i]))
	}
	return orderedJSON(fields)
}

func stableAssetCode(prefix, id string) string {
	compact := nonAlnumPattern.ReplaceAllString(id, "")
	if len(compact) > 4 {
		compact = compact[len(compact)-4:]
	}
	if compact == "" {
		compact = "0000"
	}
	return prefix + "-" + strings.ToLower(compact)
}

func jsonString(value string) string {
	body, _ := json.Marshal(value)
	return string(body)
}
