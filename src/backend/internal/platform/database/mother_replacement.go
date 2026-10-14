package database

import (
	"context"
	"database/sql"
	"encoding/json"
)

type MotherState struct {
	Found        bool
	Replaced     bool
	Replaceable  bool
	ReplacedAt   any
	SourceImages []string
}

func MotherReplacementState(ctx context.Context, db *sql.DB, workspace, motherID string) (MotherState, error) {
	var groupIndex sql.NullInt64
	var shotPrompts, provenance, sourceImages, sourceIndices sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "groupIndex", "shotPromptsJson", "provenance", "sourceImages", "sourceImageIndices"
		FROM "FullPromptAsset"
		WHERE "id" = ? AND "workspaceId" = ?`, motherID, workspace).Scan(&groupIndex, &shotPrompts, &provenance, &sourceImages, &sourceIndices)
	if err == sql.ErrNoRows {
		return MotherState{}, nil
	}
	if err != nil {
		return MotherState{}, err
	}
	var replacedAt sql.NullString
	err = db.QueryRowContext(ctx, `
		SELECT "createdAt" FROM "FullPromptImageReplacement"
		WHERE "workspaceId" = ? AND "motherAssetId" = ? LIMIT 1`, workspace, motherID).Scan(&replacedAt)
	if err != nil && err != sql.ErrNoRows {
		return MotherState{}, err
	}
	replaced := err == nil
	images := sourceImageSelection(sourceImages.String, sourceIndices.String)
	return MotherState{
		Found:        true,
		Replaced:     replaced,
		Replaceable:  groupIndex.Valid && shotObjectCount(shotPrompts.String) == 4 && provenance.String != "workshop_generated" && !replaced,
		ReplacedAt:   formatOptionalTime(replacedAt),
		SourceImages: images,
	}, nil
}

func sourceImageSelection(imagesJSON, indicesJSON string) []string {
	var images []any
	var indices []any
	if json.Unmarshal([]byte(imagesJSON), &images) != nil || json.Unmarshal([]byte(indicesJSON), &indices) != nil {
		return []string{}
	}
	selected := []string{}
	limit := len(indices)
	if limit > 4 {
		limit = 4
	}
	for _, index := range indices[:limit] {
		number, ok := index.(float64)
		if !ok || int(number) < 1 || int(number) > len(images) {
			continue
		}
		if text, ok := images[int(number)-1].(string); ok {
			selected = append(selected, text)
		}
	}
	return selected
}

func shotObjectCount(raw string) int {
	var shots []any
	if json.Unmarshal([]byte(raw), &shots) != nil {
		return 0
	}
	count := 0
	for _, shot := range shots {
		if shot != nil {
			if _, ok := shot.(map[string]any); ok {
				count++
			}
		}
	}
	return count
}

func formatOptionalTime(value sql.NullString) any {
	if !value.Valid || value.String == "" {
		return nil
	}
	return formatSQLiteTime(value.String)
}
