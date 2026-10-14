package library

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

func listPromptGroups(ctx context.Context, db *sql.DB, workspace string, page, pageSize int, keyword string, favorite bool, albumID, categoryID string, includeUniversal bool, style string) (LibraryList, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return LibraryList{}, err
	}
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		_ = tx.Rollback()
		return LibraryList{}, err
	}
	if err := tx.Commit(); err != nil {
		return LibraryList{}, err
	}
	fields := []string{"title", "albumName", "reversePromptZh", "reversePromptEn", "tags", "sceneSummary", "outfitSummary", "actionSummary"}
	where, args, err := libraryListWhere(ctx, db, workspace, keyword, favorite, albumID, categoryID, includeUniversal, fields, "full_prompt", style)
	if err != nil {
		return LibraryList{}, err
	}
	where = strings.ReplaceAll(where, `"workspaceId"`, `"FullPromptAsset"."workspaceId"`)
	where += " AND " + visiblePromptSQL
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "FullPromptAsset" WHERE `+where, args...).Scan(&total); err != nil {
		return LibraryList{}, err
	}
	names := make([]string, len(fullPromptAssetColumns))
	for i, column := range fullPromptAssetColumns {
		names[i] = `"FullPromptAsset"."` + column.name + `"`
	}
	listArgs := append([]any{workspace}, args...)
	listArgs = append(listArgs, pageSize, (page-1)*pageSize)
	rows, err := db.QueryContext(ctx, `
		SELECT `+strings.Join(names, ", ")+` FROM "FullPromptAsset"
		LEFT JOIN "FullPromptLibraryNumber" AS n
			ON n."workspaceId" = ? AND n."assetId" = "FullPromptAsset"."id"
		WHERE `+where+`
		ORDER BY CASE WHEN n."displayNumber" IS NULL THEN 1 ELSE 0 END, n."displayNumber" ASC, "FullPromptAsset"."id" ASC
		LIMIT ? OFFSET ?`, listArgs...)
	if err != nil {
		return LibraryList{}, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		item, err := scanLibraryRow(fullPromptAssetColumns, rows)
		if err != nil {
			return LibraryList{}, err
		}
		body, err := decoratePromptListItem(ctx, db, workspace, item)
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

func decoratePromptListItem(ctx context.Context, db *sql.DB, workspace string, item json.RawMessage) (json.RawMessage, error) {
	var fields map[string]any
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	id, _ := fields["id"].(string)
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
	extra := []any{"code", stableAssetCode("R", id)}
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
