package sales

import (
	"fmt"
	"strings"
)

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
	{
		var assets []PlannedAsset
		if err := decodeField(payload, "assets", &assets); err != nil {
			return nil, err
		}
		if err := validateAssetPlan(assets); err != nil {
			return nil, err
		}
		for _, asset := range assets {
			for _, index := range asset.ProductImageIndexes {
				found := false
				for _, image := range catalog {
					found = found || image.Index == index
				}
				if !found {
					return nil, fmt.Errorf("素材 %s 商品参考编号 %d 不在允许图片中", asset.ID, index)
				}
			}
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
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("图片%d：ID=%s；类型=%s；名称=%s。以下为实际参考图。", i+1, ref.ID, ref.Kind, ref.Label)}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": ref.URL, "index": i + 1}})
	}
	for _, image := range catalog {
		parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("商品事实对照原图（目录编号 %d，不是成片参考编号）", image.Index)}, map[string]any{"type": "image_url", "image_url": map[string]any{"url": image.URL, "index": image.Index}})
	}
	return parts
}
