package sales

import (
	"encoding/json"
	"fmt"
	"strings"
)

// PlannedAsset is a still required by the script, ordered before its dependants.
type PlannedAsset struct {
	ID                  string   `json:"id"`
	Kind                string   `json:"kind"`
	Label               string   `json:"label"`
	Prompt              string   `json:"prompt"`
	Required            bool     `json:"required"`
	ReferenceAssetIDs   []string `json:"referenceAssetIds,omitempty"`
	UsesProduct         bool     `json:"usesProduct"`
	ProductImageIndexes []int    `json:"productImageIndexes,omitempty"`
}

type actualReference struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Label string `json:"label"`
	URL   string `json:"url"`
}

func checkWorkflowVersion(payload map[string]any) error {
	if payload["workflowVersion"] != float64(3) {
		return fmt.Errorf("请使用当前工作室流程")
	}
	for _, field := range []string{"imageUrls", "productImages", "priceRange", "platforms", "templateId", "characterId", "fashionReferences", "referenceOrder"} {
		if _, exists := payload[field]; exists {
			return fmt.Errorf("参数 %s 已停用，请使用当前服饰制作流程", field)
		}
	}
	return nil
}

func checkFashionCategory(payload map[string]any) error {
	if payload["category"] != "fashion" {
		return fmt.Errorf("当前仅接入服饰、鞋、包技能，category 必须为 fashion")
	}
	return nil
}

func validateScriptReferences(content string, catalog []CatalogImage) error {
	var parsed struct {
		Scripts []struct {
			Shots  []map[string]json.RawMessage `json:"shots"`
			Assets []map[string]json.RawMessage `json:"assets"`
		} `json:"scripts"`
	}
	if json.Unmarshal([]byte(content), &parsed) != nil {
		return fmt.Errorf("脚本 JSON 无效")
	}
	valid := map[int]bool{}
	for _, image := range LimitVisionImages(catalog, 8) {
		valid[image.Index] = true
	}
	for _, script := range parsed.Scripts {
		for _, shot := range script.Shots {
			if raw, ok := shot["imageIndex"]; ok {
				var index int
				if string(raw) == "null" || json.Unmarshal(raw, &index) != nil || !valid[index] {
					return fmt.Errorf("脚本引用了模型未查看或不允许的商品图")
				}
			}
		}
		for _, asset := range script.Assets {
			if raw, ok := asset["productImageIndexes"]; ok {
				var indexes []int
				if string(raw) == "null" || json.Unmarshal(raw, &indexes) != nil {
					return fmt.Errorf("素材商品参考编号格式错误")
				}
				for _, index := range indexes {
					if !valid[index] {
						return fmt.Errorf("素材引用了模型未查看或不允许的商品图")
					}
				}
			}
			for _, key := range []string{"id", "kind", "label", "prompt", "required"} {
				if raw, ok := asset[key]; !ok || string(raw) == "null" {
					return fmt.Errorf("素材计划缺少 %s", key)
				}
			}
		}
	}
	return nil
}

func workflowScriptResponse(script SalesScript) map[string]any {
	data, _ := json.Marshal(script)
	var result map[string]any
	_ = json.Unmarshal(data, &result)
	if shots, ok := result["shots"].([]any); ok {
		for _, shot := range shots {
			if obj, ok := shot.(map[string]any); ok {
				delete(obj, "imageIndex")
			}
		}
	}
	return result
}

func decodeField(payload map[string]any, field string, out any) error {
	raw, ok := payload[field]
	if !ok || raw == nil {
		return fmt.Errorf("缺少 %s", field)
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	if err = json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("%s 格式错误", field)
	}
	return nil
}

// workflowCatalog preserves original indices and never admits a disallowed image.
func workflowCatalog(payload map[string]any) ([]CatalogImage, error) {
	var catalog []CatalogImage
	var eligible []int
	if err := decodeField(payload, "imageCatalog", &catalog); err != nil {
		return nil, err
	}
	if err := decodeField(payload, "eligibleImageIndexes", &eligible); err != nil {
		return nil, err
	}
	var rawEligible []json.RawMessage
	if err := decodeField(payload, "eligibleImageIndexes", &rawEligible); err != nil {
		return nil, err
	}
	for _, raw := range rawEligible {
		if string(raw) == "null" {
			return nil, fmt.Errorf("允许图片编号不能为空")
		}
	}
	if len(catalog) == 0 || len(catalog) > 40 || len(eligible) == 0 || len(eligible) > 40 {
		return nil, fmt.Errorf("商品图及允许编号不能为空且不能超过40张")
	}
	byIndex := map[int]CatalogImage{}
	var rawCatalog []map[string]json.RawMessage
	if err := decodeField(payload, "imageCatalog", &rawCatalog); err != nil {
		return nil, err
	}
	for _, image := range rawCatalog {
		for _, key := range []string{"index", "url", "role"} {
			if raw, ok := image[key]; !ok || string(raw) == "null" {
				return nil, fmt.Errorf("商品图缺少 %s", key)
			}
		}
	}
	for _, image := range catalog {
		if _, exists := byIndex[image.Index]; exists || image.Index < 0 || strings.TrimSpace(image.URL) == "" || strings.TrimSpace(image.Role) == "" {
			return nil, fmt.Errorf("商品图编号重复或图片无效")
		}
		byIndex[image.Index] = image
	}
	seen := map[int]bool{}
	out := make([]CatalogImage, 0, len(eligible))
	for _, index := range eligible {
		image, ok := byIndex[index]
		if !ok || seen[index] {
			return nil, fmt.Errorf("允许图片编号 %d 不在目录中或重复", index)
		}
		seen[index] = true
		out = append(out, image)
	}
	return out, nil
}

func workflowTiming(payload map[string]any) (int, string, error) {
	var duration int
	var ratio string
	if err := decodeField(payload, "targetDuration", &duration); err != nil {
		return 0, "", err
	}
	if duration < 10 || duration > 120 {
		return 0, "", fmt.Errorf("targetDuration 必须为10至120秒")
	}
	if err := decodeField(payload, "aspectRatio", &ratio); err != nil {
		return 0, "", err
	}
	switch ratio {
	case "9:16", "16:9", "3:4", "1:1":
	default:
		return 0, "", fmt.Errorf("aspectRatio 无效")
	}
	return duration, ratio, nil
}

func strictShots(payload map[string]any, needImages bool, catalog []CatalogImage) ([]ScriptShot, error) {
	var shots []ScriptShot
	if err := decodeField(payload, "shots", &shots); err != nil {
		return nil, err
	}
	if len(shots) == 0 || len(shots) > 40 {
		return nil, fmt.Errorf("分镜数量无效")
	}
	seen := map[int]bool{}
	for _, shot := range shots {
		if shot.ShotId <= 0 || seen[shot.ShotId] {
			return nil, fmt.Errorf("分镜编号重复或无效")
		}
		seen[shot.ShotId] = true
	}
	if err := validateSpeechModes(shots, true); err != nil {
		return nil, err
	}
	if needImages {
		var raw []map[string]json.RawMessage
		if err := decodeField(payload, "shots", &raw); err != nil {
			return nil, err
		}
		for _, shot := range raw {
			if raw, ok := shot["imageIndex"]; !ok || string(raw) == "null" {
				return nil, fmt.Errorf("分镜缺少 imageIndex")
			}
		}
		if err := shotsHaveImages(shots, catalog); err != nil {
			return nil, err
		}
	}
	return shots, nil
}

func exactDuration(shots []ScriptShot, target int) error {
	total := 0
	for _, shot := range shots {
		if shot.Duration <= 0 {
			return fmt.Errorf("分镜时长必须大于0")
		}
		total += shot.Duration
	}
	if total != target {
		return fmt.Errorf("分镜总时长 %d 秒与目标 %d 秒不符", total, target)
	}
	return nil
}

func validateAssetPlan(assets []PlannedAsset) error {
	if len(assets) < 1 || len(assets) > 4 {
		return fmt.Errorf("素材计划必须按需提供1至4张")
	}
	seen := map[string]bool{}
	kinds := map[string]string{}
	for _, asset := range assets {
		if strings.TrimSpace(asset.ID) == "" || seen[asset.ID] || strings.TrimSpace(asset.Label) == "" || strings.TrimSpace(asset.Prompt) == "" {
			return fmt.Errorf("素材编号重复或内容缺失")
		}
		switch asset.Kind {
		case "person", "face", "scene", "keyframe":
		default:
			return fmt.Errorf("未知素材类型 %s", asset.Kind)
		}
		productIndexes := map[int]bool{}
		if asset.UsesProduct && len(asset.ProductImageIndexes) == 0 {
			return fmt.Errorf("素材 %s 缺少商品参考编号", asset.ID)
		}
		for _, index := range asset.ProductImageIndexes {
			if index < 0 || productIndexes[index] || !asset.UsesProduct {
				return fmt.Errorf("素材 %s 商品参考编号无效或重复", asset.ID)
			}
			productIndexes[index] = true
		}
		deps := map[string]bool{}
		for _, id := range asset.ReferenceAssetIDs {
			if !seen[id] || deps[id] {
				return fmt.Errorf("素材 %s 依赖必须指向前序素材且不能重复", asset.ID)
			}
			deps[id] = true
		}
		if strings.HasPrefix(asset.ID, "product-") {
			return fmt.Errorf("素材编号不能使用商品参考保留前缀")
		}
		if asset.Kind == "face" {
			person := false
			for _, id := range asset.ReferenceAssetIDs {
				person = person || kinds[id] == "person"
			}
			if !person {
				return fmt.Errorf("人脸特写必须继承同一出镜人物")
			}
		}
		seen[asset.ID] = true
		kinds[asset.ID] = asset.Kind
	}
	return nil
}
