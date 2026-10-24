package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"time"
)

type officialMasterRecipe struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Tag           string  `json:"tag"`
	Desc          string  `json:"desc"`
	PromptSnippet string  `json:"promptSnippet"`
	CoverURL      *string `json:"coverUrl"`
	SampleImages  *string `json:"sampleImages"`
}

func LoadOfficialMasterRecipes(path string) ([]officialMasterRecipe, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var recipes []officialMasterRecipe
	if err := json.Unmarshal(raw, &recipes); err != nil {
		return nil, err
	}
	return recipes, nil
}

func UpsertOfficialMasterRecipes(ctx context.Context, db *sql.DB, recipes []officialMasterRecipe) error {
	if len(recipes) == 0 {
		_, err := db.ExecContext(ctx, `DELETE FROM "StyleRecipe" WHERE "workspaceId" = ?`, database.OfficialWorkspace)
		return err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, recipe := range recipes {
		var existing string
		err := db.QueryRowContext(ctx, `SELECT "id" FROM "StyleRecipe" WHERE "id" = ?`, recipe.ID).Scan(&existing)
		if err == sql.ErrNoRows {
			if _, err := db.ExecContext(ctx, `
				INSERT INTO "StyleRecipe"
				("id","workspaceId","name","category","tag","desc","promptSnippet","coverUrl","sampleImages","sourceUrl","isFavorite","createdAt","updatedAt")
				VALUES (?,?,?,?,?,?,?,?,?,NULL,1,?,?)`,
				recipe.ID, database.OfficialWorkspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet,
				recipe.CoverURL, recipe.SampleImages, now, now); err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `
			UPDATE "StyleRecipe"
			SET "workspaceId" = ?, "name" = ?, "category" = ?, "tag" = ?, "desc" = ?, "promptSnippet" = ?,
				"coverUrl" = ?, "sampleImages" = ?, "isFavorite" = 1, "updatedAt" = ?
			WHERE "id" = ?`,
			database.OfficialWorkspace, recipe.Name, recipe.Category, recipe.Tag, recipe.Desc, recipe.PromptSnippet,
			recipe.CoverURL, recipe.SampleImages, now, recipe.ID); err != nil {
			return err
		}
	}
	return nil
}
