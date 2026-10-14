package database

import (
	"context"
	"database/sql"
	"encoding/json"
)

func prepareImportedPrompt(ctx context.Context, tx *sql.Tx, workspace string, data map[string]any) error {
	albumInput := map[string]any{}
	for key, value := range data {
		albumInput[key] = value
	}
	if !createTruthy(albumInput["albumId"]) {
		albumInput["albumId"] = nil
		if text, ok := albumInput["productCategoryIds"].(string); ok {
			ids := categoryIDList(text)
			if len(ids) > 1 {
				albumInput["productCategoryIds"] = jsStringArray(ids[:1])
			}
		}
	}
	album, err := ensurePromptAlbum(ctx, tx, workspace, albumInput)
	if err != nil {
		return err
	}
	data["albumId"] = album.id
	data["albumName"] = album.name
	data["isUniversal"] = false
	if _, ok := data["productSubcategory"]; !ok && len(promptShotMarks(data["shotPromptsJson"])) == 4 {
		if inferred := inferCreateSubcategory(data); inferred != "" {
			data["productSubcategory"] = inferred
		}
	}
	number, err := nextPromptDisplayNumber(ctx, tx)
	if err != nil {
		return err
	}
	data["displayNumber"] = number
	return nil
}

func overlayImportedPromptNumbers(ctx context.Context, tx *sql.Tx, workspace string, items []json.RawMessage) error {
	needsNumbers := false
	for _, item := range items {
		var fields map[string]any
		if json.Unmarshal(item, &fields) != nil {
			continue
		}
		if libraryText(fields["reversePromptZh"]) != "" || libraryText(fields["albumName"]) != "" || fields["groupIndex"] != nil || libraryText(fields["provenance"]) == "manual" || libraryText(fields["provenance"]) == "deconstructed" {
			needsNumbers = true
			break
		}
	}
	if !needsNumbers {
		for _, item := range items {
			var fields map[string]any
			if json.Unmarshal(item, &fields) != nil {
				continue
			}
			if _, ok := fields["displayNumber"]; ok {
				needsNumbers = true
				break
			}
		}
	}
	if !needsNumbers {
		return nil
	}
	if err := ensureVisiblePromptNumbers(ctx, tx, workspace); err != nil {
		return err
	}
	for i, item := range items {
		var fields map[string]any
		if err := json.Unmarshal(item, &fields); err != nil {
			return err
		}
		if _, ok := fields["reversePromptZh"]; !ok && fields["groupIndex"] == nil && libraryText(fields["provenance"]) == "" {
			continue
		}
		if !promptRowVisible(fields) {
			items[i] = setDisplayNumber(item, nil)
			continue
		}
		id, _ := fields["id"].(string)
		var number int64
		err := tx.QueryRowContext(ctx, `
			SELECT "displayNumber" FROM "FullPromptLibraryNumber"
			WHERE "workspaceId" = ? AND "assetId" = ?`, workspace, id).Scan(&number)
		if err == sql.ErrNoRows {
			items[i] = setDisplayNumber(item, nil)
			continue
		}
		if err != nil {
			return err
		}
		items[i] = setDisplayNumber(item, &number)
	}
	return nil
}
