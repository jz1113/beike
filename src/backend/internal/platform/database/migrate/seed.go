package migrate

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
)

func seedOfficialCatalog(ctx context.Context, db execer, root, databasePath string) error {
	if _, err := os.Stat(databasePath + ".catalog-reset"); err == nil {
		log.Print("→ 本地数据库已由用户清空，跳过官方种子回填")
		return nil
	}
	recipes, err := loadRecipes(filepath.Join(root, "src/shared/data/officialMasterRecipes.json"))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	upserted, err := upsertRecipes(ctx, db, recipes)
	if err != nil {
		return err
	}
	inserted, err := seedPromptAssets(ctx, db, filepath.Join(root, "src/shared/data/promptAssets.json"))
	if err != nil {
		return err
	}
	log.Printf("→ 官方种子已同步：拍摄架构 %d 条，补齐提示词资产 %d 条", upserted, inserted)
	return nil
}

type recipeRow struct {
	ID, Name, Category, Tag, Desc, PromptSnippet string
	CoverURL, SampleImages                       *string
}

func loadRecipes(path string) ([]recipeRow, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var recipes []recipeRow
	err = json.Unmarshal(raw, &recipes)
	return recipes, err
}

func upsertRecipes(ctx context.Context, db execer, recipes []recipeRow) (int, error) {
	if len(recipes) == 0 {
		if err := exec(ctx, db, `DELETE FROM "StyleRecipe" WHERE "workspaceId" = ?`, officialWorkspace); err != nil {
			return 0, err
		}
		if err := exec(ctx, db, `DELETE FROM "PromptAssetUsageEvent" WHERE "eventType" = 'recipe_hidden'`); err != nil {
			return 0, err
		}
		return 0, nil
	}
	now := isoNow()
	for _, recipe := range recipes {
		var existing string
		err := db.QueryRowContext(ctx, `SELECT "id" FROM "StyleRecipe" WHERE "id" = ?`, recipe.ID).Scan(&existing)
		if err != nil {
			if err := exec(ctx, db, `INSERT INTO "StyleRecipe"
				("id","workspaceId","name","category","tag","desc","promptSnippet","coverUrl","sampleImages","sourceUrl","isFavorite","createdAt","updatedAt")
				VALUES (?,?,?,?,?,?,?,?,?,NULL,1,?,?)`,
				recipe.ID, officialWorkspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet,
				recipe.CoverURL, recipe.SampleImages, now, now); err != nil {
				return 0, err
			}
			continue
		}
		if err := exec(ctx, db, `UPDATE "StyleRecipe" SET "workspaceId" = ?, "name" = ?, "category" = ?, "tag" = ?, "desc" = ?, "promptSnippet" = ?, "coverUrl" = ?, "sampleImages" = ?, "isFavorite" = 1, "updatedAt" = ? WHERE "id" = ?`,
			officialWorkspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet, recipe.CoverURL, recipe.SampleImages, now, recipe.ID); err != nil {
			return 0, err
		}
	}
	return len(recipes), nil
}

func seedPromptAssets(ctx context.Context, db execer, path string) (int, error) {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	var file struct {
		Data struct {
			ProductCategories []map[string]any `json:"productCategories"`
			Albums            []map[string]any `json:"albums"`
			Scenes            []map[string]any `json:"scenes"`
			Outfits           []map[string]any `json:"outfits"`
			Personas          []map[string]any `json:"personas"`
			FullPrompts       []map[string]any `json:"fullPrompts"`
			Actions           []map[string]any `json:"actions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return 0, err
	}
	inserted := 0
	inserted += insertMissing(ctx, db, "AssetProductCategory", file.Data.ProductCategories, []string{"id", "name", "parentId", "position"}, nil)
	inserted += insertMissing(ctx, db, "PromptAlbum", file.Data.Albums, []string{"id", "name", "sourceKey", "productCategoryId"}, nil)
	inserted += insertMissing(ctx, db, "SceneAsset", file.Data.Scenes, []string{"id", "title", "description", "lighting", "category", "spatialType", "suitableCategories", "tags", "coverUrl", "sourceImages", "reversePrompt", "dimensions", "sourceImageIndex", "imageType", "provenance", "usageCount", "isFavorite", "albumId", "productCategoryIds", "isUniversal"}, nil)
	inserted += insertMissing(ctx, db, "OutfitAsset", file.Data.Outfits, []string{"id", "title", "top", "bottom", "shoes", "colorPalette", "category", "suitableCategories", "tags", "coverUrl", "sourceImages", "reversePrompt", "dimensions", "sourceImageIndex", "imageType", "provenance", "usageCount", "isFavorite", "albumId", "productCategoryIds", "isUniversal"}, nil)
	inserted += insertMissing(ctx, db, "PersonaAsset", file.Data.Personas, []string{"id", "name", "description", "tags", "avatarUrl", "sourceImages", "reversePrompt", "dimensions", "sourceImageIndex", "imageType", "provenance", "usageCount", "isFavorite", "albumId", "productCategoryIds", "isUniversal"}, nil)
	inserted += insertMissing(ctx, db, "FullPromptAsset", file.Data.FullPrompts, []string{"id", "title", "albumName", "reversePromptZh", "reversePromptEn", "dimensions", "imageType", "sourceImageIndex", "sourceImageIndices", "groupIndex", "contentSummary", "architectureSummary", "replaceableSlots", "shotPromptsJson", "coverUrl", "sourceImages", "hasHuman", "shotFraming", "productFrameRatio", "sceneSummary", "outfitSummary", "actionSummary", "personaSummary", "tags", "category", "productSubcategory", "provenance", "usageCount", "isFavorite", "albumId", "productCategoryIds", "isUniversal"}, prepareFullPrompt)
	inserted += insertMissing(ctx, db, "ActionAsset", file.Data.Actions, []string{"id", "title", "action", "shotType", "spatialType", "camera", "suitableAnatomy", "tags", "coverUrl", "sourceImages", "reversePrompt", "dimensions", "sourceImageIndex", "imageType", "provenance", "sceneId", "shotOrder", "usageCount", "isFavorite", "albumId", "productCategoryIds", "isUniversal"}, nil)
	return inserted, nil
}

func prepareFullPrompt(ctx context.Context, db execer, fields map[string]any) error {
	if value, ok := fields["productSubcategory"]; ok && value != nil {
		text, _ := value.(string)
		if text != "" && !isPromptGroupSubcategory(text) {
			return errSkipRow
		}
	}
	shots, _ := fields["shotPromptsJson"].(string)
	if _, set := fields["productSubcategory"]; !set && len(parseGroupShots(shots)) == 4 {
		title, _ := fields["title"].(string)
		if subcategory := inferPromptGroupSubcategory(title, shots); subcategory != "" {
			fields["productSubcategory"] = subcategory
		}
	}
	if isLegacyFullPromptSingle(fields) {
		fields["provenance"] = "legacy_single"
	}
	if isFullPromptGroupVisible(fields) {
		number, err := nextFullPromptDisplayNumber(ctx, db)
		if err != nil {
			return err
		}
		fields["displayNumber"] = number
	}
	return nil
}

var errSkipRow = errSkip{}

type errSkip struct{}

func (errSkip) Error() string { return "skip" }

func isLegacyFullPromptSingle(fields map[string]any) bool {
	provenance, _ := fields["provenance"].(string)
	if provenance == "" {
		provenance = "deconstructed"
	}
	_, hasGroup := fields["groupIndex"]
	return provenance == "deconstructed" && !hasGroup && !hasSavedGroupStructure(fields["sourceImageIndices"]) && !hasSavedGroupStructure(fields["shotPromptsJson"])
}

func isFullPromptGroupVisible(fields map[string]any) bool {
	provenance, _ := fields["provenance"].(string)
	return provenance != "legacy_single" && !isLegacyFullPromptSingle(fields)
}

func hasSavedGroupStructure(value any) bool {
	switch typed := value.(type) {
	case nil:
		return false
	case string:
		return typed != "" && typed != "[]" && typed != "null"
	case []any:
		return len(typed) > 0
	default:
		return true
	}
}
