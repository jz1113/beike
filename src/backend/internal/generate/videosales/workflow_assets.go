package videosales

import (
	"encoding/json"
	"fmt"
	"strings"
)

type assetValidation struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Reason string `json:"reason"`
}

func workflowReferences(payload map[string]any, catalog []CatalogImage) ([]actualReference, error) {
	var refs []actualReference
	if err := decodeField(payload, "actualReferences", &refs); err != nil {
		return nil, err
	}
	if len(refs) == 0 || len(refs) > 44 {
		return nil, fmt.Errorf("actualReferences 数量无效")
	}
	eligibleURLs := map[string]bool{}
	for _, image := range catalog {
		eligibleURLs[image.URL] = true
	}
	// A catalog image cannot be relabelled as a person/scene to bypass eligibility.
	for _, image := range parseCatalog(payload) {
		if !eligibleURLs[image.URL] {
			for _, ref := range refs {
				if ref.URL == image.URL {
					return nil, fmt.Errorf("实际参考图使用了不允许的商品图")
				}
			}
		}
	}
	seen := map[string]actualReference{}
	for _, ref := range refs {
		if strings.TrimSpace(ref.ID) == "" || strings.TrimSpace(ref.Label) == "" || strings.TrimSpace(ref.URL) == "" {
			return nil, fmt.Errorf("实际参考图缺少编号、名称或图片")
		}
		if _, ok := seen[ref.ID]; ok {
			return nil, fmt.Errorf("实际参考图编号重复：%s", ref.ID)
		}
		switch ref.Kind {
		case "product":
			if !eligibleURLs[ref.URL] {
				return nil, fmt.Errorf("商品参考 %s 不在允许图片中", ref.ID)
			}
		case "person", "face", "scene", "keyframe":
		default:
			return nil, fmt.Errorf("未知实际参考类型 %s", ref.Kind)
		}
		seen[ref.ID] = ref
	}
	if _, ok := payload["assets"]; ok {
		var assets []PlannedAsset
		if err := decodeField(payload, "assets", &assets); err != nil {
			return nil, err
		}
		if err := validateAssetPlan(assets); err != nil {
			return nil, err
		}
		for _, asset := range assets {
			ref, exists := seen[asset.ID]
			if asset.Required && !exists {
				return nil, fmt.Errorf("缺少必要素材 %s", asset.ID)
			}
			if exists && ref.Kind != asset.Kind {
				return nil, fmt.Errorf("素材 %s 类型不一致", asset.ID)
			}
			if exists {
				for _, dep := range asset.ReferenceAssetIDs {
					if _, ok := seen[dep]; !ok {
						return nil, fmt.Errorf("缺少素材依赖 %s", dep)
					}
				}
			}
		}
	}
	return refs, nil
}

func workflowVisionParts(text string, refs []actualReference, catalog []CatalogImage) []map[string]any {
	parts := []map[string]any{{"type": "text", "text": text}}
	for i, ref := range refs {
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("图片%d：ID=%s；类型=%s；名称=%s。以下为实际参考图。", i+1, ref.ID, ref.Kind, ref.Label)}, map[string]any{"type": "image_url", "image_url": map[string]string{"url": ref.URL}})
	}
	for _, image := range catalog {
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("商品事实对照原图（目录编号 %d，不是成片参考编号）", image.Index)}, map[string]any{"type": "image_url", "image_url": map[string]string{"url": image.URL}})
	}
	return parts
}

func parseValidations(content string, refs []actualReference) ([]assetValidation, error) {
	var parsed struct {
		Validations []assetValidation `json:"validations"`
	}
	if json.Unmarshal([]byte(content), &parsed) != nil || len(parsed.Validations) != len(refs) {
		return nil, fmt.Errorf("素材校验结果不是完整的 JSON")
	}
	expected := map[string]bool{}
	for _, ref := range refs {
		expected[ref.ID] = true
	}
	byID := map[string]assetValidation{}
	for _, item := range parsed.Validations {
		if !expected[item.ID] || byID[item.ID].ID != "" {
			return nil, fmt.Errorf("素材校验返回未知或重复ID")
		}
		if strings.TrimSpace(item.Reason) == "" {
			return nil, fmt.Errorf("素材校验缺少依据")
		}
		switch item.Status {
		case "passed", "conflict", "uncertain":
		default:
			return nil, fmt.Errorf("未知素材校验状态 %s", item.Status)
		}
		byID[item.ID] = item
	}
	out := make([]assetValidation, 0, len(refs))
	for _, ref := range refs {
		item, ok := byID[ref.ID]
		if !ok {
			return nil, fmt.Errorf("素材校验遗漏ID %s", ref.ID)
		}
		out = append(out, item)
	}
	return out, nil
}

func validationBody(model string, payload map[string]any, shots []ScriptShot, refs []actualReference, catalog []CatalogImage) map[string]any {
	facts, _ := json.Marshal(map[string]any{"shots": shots, "selectedColor": payload["selectedColor"], "productAnalysis": payload["productAnalysis"], "assets": payload["assets"]})
	system := `你是实际图片视觉校验员，必须逐张查看实际参考图与商品事实对照原图，不能仅凭文字声称通过。验证实际图是否满足脚本、商品颜色和款式、相同人物身份、脸与人物一致、场景连续性；上身图和关键帧若含商品，外观必须与商品原图及 selectedColor 一致。纯人物图不要求出现商品。图片无法辨认、无法查看或证据不足时必须 uncertain，明显冲突时 conflict，仅图中确有依据时 passed。不得伪造通过。每个实际参考ID返回且只返回一条，禁止未知ID；只输出 JSON {"validations":[{"id":"实际ID","status":"passed|conflict|uncertain","reason":"具体可见依据或无法确认的原因"}]}。`
	return chatBody(model, system, workflowVisionParts("脚本与商品事实："+string(facts), refs, catalog), 0.1)
}
