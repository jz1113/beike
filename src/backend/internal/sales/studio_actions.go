package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
)

type studioAction struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Action             string   `json:"action"`
	ShotType           string   `json:"shotType"`
	Camera             string   `json:"camera"`
	Tags               string   `json:"tags"`
	CoverURL           string   `json:"coverUrl"`
	MediaType          string   `json:"mediaType"`
	MediaURL           string   `json:"mediaUrl"`
	SourceURL          string   `json:"sourceUrl"`
	SourceImages       []string `json:"sourceImages"`
	Dimensions         string   `json:"dimensions"`
	ProductCategoryIDs []string `json:"productCategoryIds"`
	CategoryID         string   `json:"categoryId"`
}

func parseActionCategoryIDs(raw string) ([]string, string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "[]" {
		return []string{}, ""
	}
	var list []string
	if err := json.Unmarshal([]byte(trimmed), &list); err == nil {
		out := make([]string, 0, len(list))
		for _, item := range list {
			id := strings.TrimSpace(item)
			if id != "" {
				out = append(out, id)
			}
		}
		if len(out) > 0 {
			return out, out[0]
		}
		return []string{}, ""
	}
	return []string{trimmed}, trimmed
}

func parseActionSourceImages(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "[]" {
		return []string{}
	}
	var list []string
	if err := json.Unmarshal([]byte(trimmed), &list); err == nil {
		out := make([]string, 0, len(list))
		for _, item := range list {
			clean := strings.TrimSpace(item)
			if clean != "" {
				out = append(out, clean)
			}
		}
		return out
	}
	return []string{}
}

func queryStudioActions(ctx context.Context, db *sql.DB, workspace string) ([]studioAction, error) {
	out := []studioAction{}
	withExtras := true
	rows, err := db.QueryContext(ctx, `SELECT "id","title","action","shotType",COALESCE("camera",''),COALESCE("tags",''),COALESCE("coverUrl",''),COALESCE("mediaType",'image'),COALESCE("mediaUrl",''),COALESCE("sourceUrl",''),COALESCE("sourceImages",'[]'),COALESCE("dimensions",''),COALESCE("productCategoryIds",'[]') FROM "ActionAsset" WHERE "workspaceId" = ? ORDER BY "isFavorite" DESC,"usageCount" DESC,"createdAt" DESC`, workspace)
	if err != nil && strings.Contains(err.Error(), "no such column") {
		withExtras = false
		rows, err = db.QueryContext(ctx, `SELECT "id","title","action","shotType",COALESCE("camera",''),COALESCE("tags",''),COALESCE("coverUrl",''),COALESCE("mediaType",'image'),COALESCE("mediaUrl",''),COALESCE("sourceUrl",''),COALESCE("productCategoryIds",'[]') FROM "ActionAsset" WHERE "workspaceId" = ? ORDER BY "isFavorite" DESC,"usageCount" DESC,"createdAt" DESC`, workspace)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var item studioAction
		var rawSources, rawCats string
		var scanErr error
		if withExtras {
			scanErr = rows.Scan(&item.ID, &item.Title, &item.Action, &item.ShotType, &item.Camera, &item.Tags, &item.CoverURL, &item.MediaType, &item.MediaURL, &item.SourceURL, &rawSources, &item.Dimensions, &rawCats)
		} else {
			scanErr = rows.Scan(&item.ID, &item.Title, &item.Action, &item.ShotType, &item.Camera, &item.Tags, &item.CoverURL, &item.MediaType, &item.MediaURL, &item.SourceURL, &rawCats)
		}
		if scanErr != nil {
			return nil, scanErr
		}
		item.SourceImages = parseActionSourceImages(rawSources)
		item.ProductCategoryIDs, item.CategoryID = parseActionCategoryIDs(rawCats)
		out = append(out, item)
	}
	return out, rows.Err()
}
