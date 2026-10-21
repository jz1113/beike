package generate

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
)

type workshopBinding struct {
	Group        map[string]any
	Shots        []map[string]any
	References   []string
	Replacements map[string]map[string]any
	Selection    string
	Skill        map[string]any
}

// Read authoritative asset contents in this workspace. Client descriptions never replace stored evidence.
func loadWorkshopBinding(cfg config.Config, r *http.Request, payload map[string]json.RawMessage) (*workshopBinding, error) {
	if rawString(payload, "mode") != "storyboard_generate" {
		return nil, nil
	}
	var locks map[string]string
	if json.Unmarshal(payload["lockedAssets"], &locks) != nil || locks["fullPromptId"] == "" {
		return nil, errors.New("尚未绑定参考图组，请重新分析；不会改用通用分镜")
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	load := func(kind, id string) (map[string]any, error) {
		var raw json.RawMessage
		var err error
		if kind == "full_prompt" {
			raw, err = dblibrary.LibraryPromptDetail(r.Context(), db, workspaceOf(r), id)
		} else {
			raw, err = dblibrary.LibraryDetail(r.Context(), db, workspaceOf(r), kind, id)
		}
		if err != nil {
			return nil, fmt.Errorf("参考资产不存在或不可访问：%s", id)
		}
		var fields map[string]any
		if json.Unmarshal(raw, &fields) != nil {
			return nil, errors.New("参考资产数据损坏")
		}
		if reason := TextField(fields, "productionBlockReason"); reason != "" {
			return nil, errors.New(reason)
		}
		return fields, nil
	}
	group, err := load("full_prompt", locks["fullPromptId"])
	if err != nil {
		return nil, err
	}
	shots := workshopObjects(group["shotPromptsJson"])
	indices := workshopValues(group["sourceImageIndices"])
	images := workshopValues(group["sourceImages"])
	if len(shots) != 4 || len(indices) != 4 {
		return nil, errors.New("母本需要完整的四镜反推词和来源索引")
	}
	refs := make([]string, 4)
	seen := map[int]bool{}
	for i, value := range indices {
		n, ok := value.(float64)
		if !ok || n != float64(int(n)) || n < 1 || int(n) > len(images) || seen[int(n)] {
			return nil, errors.New("参考图组原图缺失或索引重复，请补充原图后重试")
		}
		refs[i], _ = images[int(n)-1].(string)
		if strings.TrimSpace(refs[i]) == "" {
			return nil, errors.New("参考图组原图缺失，请补充原图后重试")
		}
		seen[int(n)] = true
	}
	if err := checkWorkshopFolder(r, db, group, locks["groupFolderId"]); err != nil {
		return nil, err
	}
	binding := &workshopBinding{Group: group, Shots: shots, References: refs, Replacements: map[string]map[string]any{}, Selection: rawString(payload, "groupSelectionMode")}
	if id := rawString(payload, "recipeId"); id != "" {
		page, err := dbcatalog.ListStyleRecipes(r.Context(), db, workspaceOf(r), "", 1, 10000)
		if err != nil {
			return nil, err
		}
		for _, recipe := range page.Recipes {
			if recipe["id"] == id {
				binding.Skill = recipe
				break
			}
		}
		if binding.Skill == nil {
			return nil, errors.New("类目技能已删除或不可访问，请重新选择")
		}
		payload["templateStyle"], _ = json.Marshal(TextField(binding.Skill, "name") + "\n" + TextField(binding.Skill, "promptSnippet"))
	}
	portrait := false
	for _, shot := range shots {
		if workshopShotType(shot) == "model_shot" {
			portrait = true
		}
	}
	if (rawString(payload, "modelPersona") == "none" || locks["groupAppearance"] == "product") && portrait {
		return nil, errors.New("当前无人物设置与母本冲突，请重新选择图组")
	}
	if locks["groupAppearance"] == "human" && !portrait {
		return nil, errors.New("当前母本不含人物镜头")
	}
	for _, kind := range []string{"scene", "persona", "outfit"} {
		id := locks[kind+"Id"]
		if id == "" || id == "auto" || (!portrait && kind != "scene") {
			continue
		}
		if strings.HasPrefix(id, "rotate") {
			return nil, errors.New("人物穿搭轮换尚未解析，请重新选择具体资产或沿用母本")
		}
		asset, err := load(kind, id)
		if err != nil {
			return nil, err
		}
		binding.Replacements[kind] = asset
	}
	return binding, nil
}

func checkWorkshopFolder(r *http.Request, db *sql.DB, group map[string]any, folder string) error {
	if folder == "" || folder == "auto" {
		return nil
	}
	var parent sql.NullString
	var archived int
	err := db.QueryRowContext(r.Context(), `SELECT "parentId", "isArchived" FROM "AssetProductCategory" WHERE "id" = ? AND "workspaceId" IN (?, 'official')`, folder, workspaceOf(r)).Scan(&parent, &archived)
	if err == sql.ErrNoRows && strings.HasPrefix(folder, database.PromptSubcategoryPrefix+"digital_3c:") {
		parent = sql.NullString{String: "digital_3c", Valid: true}
		err = nil
	}
	if err != nil || archived != 0 {
		return errors.New("母本文件夹已删除或不可访问")
	}
	if parent.Valid {
		sub := TextField(group, "productSubcategory")
		if sub != folder && database.BuiltinFolderID(sub) != folder {
			return errors.New("母本不在所选细分文件夹内")
		}
	} else {
		matched := false
		for _, id := range workshopValues(group["productCategoryIds"]) {
			if id == folder {
				matched = true
			}
		}
		if !matched {
			return errors.New("母本不在所选商品大类内")
		}
	}
	return nil
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
	if kind == "hand_held_only" || kind == "pure_product" || kind == "model_shot" {
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
