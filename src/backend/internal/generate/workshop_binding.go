package generate

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	learning "beike.local/cloud/src/backend/internal/platform/database/learning"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

type workshopBinding struct {
	Skill map[string]any
}

// Production reads a saved skill and current product facts. Legacy asset locks
// remain parseable in old batches but never select production inputs.
func loadWorkshopBinding(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (*workshopBinding, error) {
	if rawString(payload, "mode") != "storyboard_generate" {
		return nil, nil
	}
	var images []string
	_ = json.Unmarshal(payload["imageUrls"], &images)
	if len(images) == 0 || strings.TrimSpace(images[0]) == "" {
		return nil, errors.New("请先选择并确认商品图")
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	id := rawString(payload, "recipeId")
	var skill map[string]any
	if id == "" || id == "auto" || id == learning.BaseRecipeID {
		skill = learning.BaseRecipe()
		var props map[string]string
		_ = json.Unmarshal(payload["productProps"], &props)
		skill, err = learning.ForProduct(r.Context(), db, workspaceOf(r), rawString(payload, "productTitle"), props, skill)
		if err != nil {
			return nil, err
		}
	} else {
		page, err := dbcatalog.ListStyleRecipes(r.Context(), db, workspaceOf(r), "", 1, 10000)
		if err != nil {
			return nil, err
		}
		for _, recipe := range page.Recipes {
			if recipe["id"] == id {
				skill = recipe
				break
			}
		}
		if skill == nil {
			return nil, errors.New("创作技能已删除或不可访问，请重新选择")
		}
		if version := rawString(payload, "recipeVersion"); version != "" {
			skill, err = dbcatalog.ReadSkillRevision(r.Context(), db, workspaceOf(r), "workshop", id, version)
			if err != nil {
				return nil, errors.New("本次技能版本不可访问，请刷新技能后重新分析")
			}
		} else {
			version, err := dbcatalog.RememberSkillRevision(r.Context(), db, workspaceOf(r), "workshop", id, skill)
			if err != nil {
				return nil, err
			}
			skill["libraryVersion"] = version
		}
	}
	if strings.TrimSpace(TextField(skill, "promptSnippet")) == "" {
		return nil, errors.New("创作技能内容为空，请先补全技能")
	}
	payload["templateStyle"], _ = json.Marshal(TextField(skill, "name") + "\n" + TextField(skill, "promptSnippet"))
	return &workshopBinding{Skill: skill}, nil
}

func workshopValues(value any) []any {
	if text, ok := value.(string); ok {
		_ = json.Unmarshal([]byte(text), &value)
	}
	list, _ := value.([]any)
	return list
}

func workshopObjects(value any) []map[string]any {
	out := []map[string]any{}
	for _, entry := range workshopValues(value) {
		if obj, ok := entry.(map[string]any); ok {
			out = append(out, obj)
		}
	}
	return out
}

func workshopShotType(shot map[string]any) string {
	kind := TextField(shot, "shot_type")
	if kind == "hand_held_only" || kind == "pure_product" {
		return kind
	}
	prompt := TextField(shot, "prompt")
	refined := dblibrary.RefineShotType("model_shot", prompt)
	if refined != "model_shot" {
		return refined
	}

	if kind == "model_shot" {
		return kind
	}
	if human, ok := shot["has_human"].(bool); ok && !human {
		return "pure_product"
	}
	if kind == "model_shot" || shot["has_human"] == true {
		return "model_shot"
	}
	return "unknown"
}
