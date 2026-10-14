package library

import (
	"context"
	"database/sql"
)

func insertFullPrompt(ctx context.Context, tx *sql.Tx, workspace, id, now string, number int64, album storedAlbum, categoryID *string, subcategory any, data map[string]any) (string, error) {
	title, err := textOrDefault(data["title"], "新完整反推提示词")
	if err != nil {
		return "", err
	}
	prompt, err := textOrDefault(data["reversePromptZh"], "")
	if err != nil {
		return "", err
	}
	english, err := textOrDefault(data["reversePromptEn"], "")
	if err != nil {
		return "", err
	}
	dimensions, err := jsonListOrString(data["dimensions"], map[string]any{})
	if err != nil {
		return "", err
	}
	imageType, err := textOrDefault(data["imageType"], "photography")
	if err != nil {
		return "", err
	}
	index, err := promptSourceIndex(data["sourceImageIndex"])
	if err != nil {
		return "", err
	}
	cover, err := textOrDefault(data["coverUrl"], "")
	if err != nil {
		return "", err
	}
	sources, err := jsonListOrString(data["sourceImages"], []any{})
	if err != nil {
		return "", err
	}
	framing, err := textOrDefault(data["shotFraming"], "medium_full_body")
	if err != nil {
		return "", err
	}
	scene, err := textOrDefault(data["sceneSummary"], "")
	if err != nil {
		return "", err
	}
	outfit, err := textOrDefault(data["outfitSummary"], "")
	if err != nil {
		return "", err
	}
	action, err := textOrDefault(data["actionSummary"], "")
	if err != nil {
		return "", err
	}
	persona, err := textOrDefault(data["personaSummary"], "")
	if err != nil {
		return "", err
	}
	tags, err := tagsText(data["tags"])
	if err != nil {
		return "", err
	}
	category, err := textOrDefault(data["category"], "general")
	if err != nil {
		return "", err
	}
	provenance, err := textOrDefault(data["provenance"], "deconstructed")
	if err != nil {
		return "", err
	}
	human := 1
	if data["hasHuman"] == false {
		human = 0
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO "FullPromptAsset" (
			"id", "workspaceId", "title", "albumName", "reversePromptZh", "reversePromptEn", "dimensions",
			"imageType", "sourceImageIndex", "coverUrl", "sourceImages", "hasHuman", "shotFraming",
			"sceneSummary", "outfitSummary", "actionSummary", "personaSummary", "tags", "category",
			"productSubcategory", "provenance", "usageCount", "isFavorite", "createdAt", "updatedAt",
			"albumId", "productCategoryIds", "isUniversal", "displayNumber"
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0, ?)`,
		id, workspace, title, album.name, prompt, english, dimensions, imageType, index, cover, sources, human,
		framing, scene, outfit, action, persona, tags, category, subcategory, provenance, now, now, album.id,
		majorCategoryJSON(categoryID), number)
	return provenance, err
}

func promptSourceIndex(value any) (int64, error) {
	if !createTruthy(value) {
		return 1, nil
	}
	return shotOrderValue(value)
}
