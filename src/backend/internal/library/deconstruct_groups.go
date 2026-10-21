package library

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func deconstructGroupDrafts(stored map[string]any) ([]map[string]any, error) {
	parsed, _ := stored["parsedResult"].(map[string]any)
	images, typedImages := stored["imageUrls"].([]string)
	if !typedImages {
		images = stringList(stored["imageUrls"])
	}
	perImage, _ := stored["perImageResults"].([]any)
	byIndex := map[int]map[string]any{}
	for i, entry := range perImage {
		item, ok := entry.(map[string]any)
		if !ok {
			return nil, errors.New("逐图反推数据损坏")
		}
		n := i + 1
		if index, ok := item["image_index"].(float64); ok {
			if index != float64(int(index)) || index < 1 {
				return nil, errors.New("逐图索引无效")
			}
			n = int(index)
		}
		if byIndex[n] != nil {
			return nil, errors.New("逐图索引重复")
		}
		byIndex[n] = item
	}
	groups, _ := parsed["content_groups"].([]any)
	if len(groups) == 0 {
		for i := 0; i+4 <= len(images); i += 4 {
			groups = append(groups, map[string]any{"source_image_indices": []any{float64(i + 1), float64(i + 2), float64(i + 3), float64(i + 4)}})
		}
	}
	drafts := []map[string]any{}
	used := map[int]bool{}
	for groupIndex, entry := range groups {
		group, ok := entry.(map[string]any)
		if !ok {
			return nil, errors.New("图组数据损坏")
		}
		indices, _ := group["source_image_indices"].([]any)
		if len(indices) != 4 {
			return nil, errors.New("每组必须有四张来源图片")
		}
		shots := []any{}
		prompts := []string{}
		hasHuman := false
		for i, value := range indices {
			n, ok := value.(float64)
			if !ok || n != float64(int(n)) || n < 1 || int(n) > len(images) || used[int(n)] {
				return nil, errors.New("图组来源索引缺失或重复")
			}
			source := byIndex[int(n)]
			if source == nil {
				return nil, errors.New("图组缺少对应的逐图反推词")
			}
			prompt := firstString(source["reverse_prompt_zh"], source["reverse_prompt"], source["prompt"])
			if strings.TrimSpace(prompt) == "" {
				return nil, errors.New("反推词为空，未创建占位母本")
			}
			action, _ := source["action"].(map[string]any)
			scene, _ := source["scene"].(map[string]any)
			kind := stringValue(source["shot_type"])
			human, _ := source["has_human"].(bool)
			if kind != "model_shot" && kind != "hand_held_only" && kind != "pure_product" {
				if human {
					kind = "model_shot"
				} else {
					kind = "pure_product"
				}
			}
			human = kind == "model_shot"
			hasHuman = hasHuman || human
			shots = append(shots, map[string]any{"shot_no": i + 1, "prompt": prompt, "title": source["title"], "has_human": human, "shot_type": kind,
				"scene": stringValue(scene["description"]), "action": stringValue(action["action"]), "camera_focal_length": stringValue(action["camera"]), "lighting_type": stringValue(scene["lighting"])})
			prompts = append(prompts, prompt)
			used[int(n)] = true
		}
		rawIndices, _ := json.Marshal(indices)
		rawShots, _ := json.Marshal(shots)
		rawImages, _ := json.Marshal(images)
		draft := map[string]any{"title": firstString(group["title"], fmt.Sprintf("参考图组 %d", groupIndex+1)), "albumName": stored["albumName"],
			"reversePromptZh": strings.Join(prompts, "\n\n"), "sourceImages": string(rawImages), "sourceImageIndices": string(rawIndices), "shotPromptsJson": string(rawShots),
			"sourceImageIndex": json.Number(strconv.Itoa(int(indices[0].(float64)))), "groupIndex": groupIndex + 1, "coverUrl": images[int(indices[0].(float64))-1], "hasHuman": hasHuman,
			"contentSummary": firstString(parsed["content_summary"], group["title"]), "architectureSummary": stringValue(group["architecture_summary"]),
			"category": firstString(parsed["theme_category"], "general"), "provenance": firstString(stored["provenance"], "deconstructed")}
		if category := stringValue(stored["targetProductCategory"]); category != "" {
			ids, _ := json.Marshal([]string{category})
			draft["productCategoryIds"] = string(ids)
		}
		if sub := stringValue(stored["targetSubcategory"]); sub != "" {
			draft["productSubcategory"] = sub
		}
		drafts = append(drafts, draft)
	}
	return drafts, nil
}
