package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

func applyWorkshopRepair(ctx context.Context, db execer) error {
	// Existing source roles and version manifests remain available as history.
	if err := exec(ctx, db, `UPDATE "CategorySkillScope" SET "minSamples"=1,"autoAnalyze"=0,"lastAttempt"=''`); err != nil {
		return err
	}
	rows, err := db.QueryContext(ctx, `SELECT "id","shotPromptsJson","productCategoryIds","productSubcategory" FROM "FullPromptAsset" WHERE "shotPromptsJson" IS NOT NULL`)
	if err != nil {
		return err
	}
	type record struct {
		id, raw, categories string
		sub                 sql.NullString
	}
	records := []record{}
	for rows.Next() {
		var r record
		if err := rows.Scan(&r.id, &r.raw, &r.categories, &r.sub); err != nil {
			rows.Close()
			return err
		}
		records = append(records, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, r := range records {
		var shots []map[string]any
		if json.Unmarshal([]byte(r.raw), &shots) != nil || len(shots) != 4 {
			continue
		}
		changed, human := false, false
		for _, shot := range shots {
			kind, _ := shot["shot_type"].(string)
			prompt, _ := shot["prompt"].(string)
			refined := dblibrary.RefineShotType(kind, prompt)
			if refined != kind {
				shot["shot_type"], shot["has_human"] = refined, refined == "model_shot"
				changed = true
			}
			human = human || refined == "model_shot" || (refined == "" && shot["has_human"] == true)
		}
		if changed {
			body, err := json.Marshal(shots)
			if err != nil {
				return err
			}
			if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "shotPromptsJson"=?,"hasHuman"=? WHERE "id"=?`, string(body), human, r.id); err != nil {
				return err
			}
		}
		// Repair only standard digital folders with repeated subject evidence.
		if strings.Contains(r.categories, `"digital_3c"`) && (r.sub.String == "phone" || r.sub.String == "prompt_subcategory:digital_3c:phone") {
			inferred := dblibrary.InferReferenceSubcategory(map[string]any{"shotPromptsJson": r.raw})
			if inferred != "" && inferred != "phone" {
				folder := "prompt_subcategory:digital_3c:" + inferred
				var archived int
				err := db.QueryRowContext(ctx, `SELECT "isArchived" FROM "AssetProductCategory" WHERE "id"=?`, folder).Scan(&archived)
				if err != nil && err != sql.ErrNoRows {
					return err
				}
				if err == nil && archived == 0 {
					if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productSubcategory"=? WHERE "id"=?`, inferred, r.id); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

// Recover only built-in folders justified by repeated primary-subject evidence.
func applyReferenceFolderRepair(ctx context.Context, db execer) error {
	rows, err := db.QueryContext(ctx, `SELECT "id","workspaceId","shotPromptsJson","productCategoryIds" FROM "FullPromptAsset" WHERE "productSubcategory" IN ('phone','prompt_subcategory:digital_3c:phone') AND "shotPromptsJson" IS NOT NULL`)
	if err != nil {
		return err
	}
	type record struct{ id, workspace, shots, categories string }
	records := []record{}
	for rows.Next() {
		var r record
		if err := rows.Scan(&r.id, &r.workspace, &r.shots, &r.categories); err != nil {
			rows.Close()
			return err
		}
		records = append(records, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, r := range records {
		var categories []string
		var shots []map[string]any
		if json.Unmarshal([]byte(r.categories), &categories) != nil || json.Unmarshal([]byte(r.shots), &shots) != nil || len(shots) != 4 {
			continue
		}
		digital := false
		for _, id := range categories {
			digital = digital || id == "digital_3c"
		}
		if !digital {
			continue
		}
		kind := dblibrary.ReferenceSubjectSubcategory(r.shots)
		name := map[string]string{"case": "手机壳", "earphone": "耳机", "tablet": "平板"}[kind]
		if name == "" {
			continue
		}
		var owner string
		err := db.QueryRowContext(ctx, `SELECT "workspaceId" FROM "AssetProductCategory" WHERE "id"='digital_3c' AND "isArchived"=0 AND "workspaceId" IN (?, 'official')`, r.workspace).Scan(&owner)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return err
		}
		folder := "prompt_subcategory:digital_3c:" + kind
		if err := exec(ctx, db, `INSERT OR IGNORE INTO "AssetProductCategory" ("id","name","parentId","workspaceId") VALUES (?,?,'digital_3c',?)`, folder, name, owner); err != nil {
			return err
		}
		result, err := db.ExecContext(ctx, `UPDATE "AssetProductCategory" SET "isArchived"=0 WHERE "id"=? AND "parentId"='digital_3c' AND "workspaceId" IN (?, 'official')`, folder, r.workspace)
		if err != nil {
			return err
		}
		if count, _ := result.RowsAffected(); count != 1 {
			continue
		}
		if err := exec(ctx, db, `UPDATE "FullPromptAsset" SET "productSubcategory"=? WHERE "id"=? AND "workspaceId"=?`, kind, r.id, r.workspace); err != nil {
			return err
		}
	}
	return nil
}
