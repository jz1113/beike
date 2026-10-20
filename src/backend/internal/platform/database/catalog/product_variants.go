package catalog

import (
	"encoding/json"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/media"
)

type ProductColorVariant struct {
	ID        string   `json:"id"`
	Label     string   `json:"label"`
	Color     string   `json:"color,omitempty"`
	SKUIDs    []string `json:"skuIds"`
	ImageURLs []string `json:"imageUrls"`
}

type ProductVariantMetadata struct {
	Version           int                   `json:"version"`
	Variants          []ProductColorVariant `json:"variants"`
	RequestedSKUID    string                `json:"requestedSkuId,omitempty"`
	SelectedVariantID string                `json:"selectedVariantId,omitempty"`
}

// ReadProductVariantMetadata rejects malformed historical data without inventing evidence.
func ReadProductVariantMetadata(value any) *ProductVariantMetadata {
	body, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var result ProductVariantMetadata
	if json.Unmarshal(body, &result) != nil || result.Version != 1 || result.Variants == nil {
		return nil
	}
	ids := map[string]bool{}
	for index := range result.Variants {
		variant := &result.Variants[index]
		variant.ID, variant.Label = strings.TrimSpace(variant.ID), strings.TrimSpace(variant.Label)
		if variant.ID == "" || variant.Label == "" || ids[variant.ID] || variant.SKUIDs == nil || variant.ImageURLs == nil {
			return nil
		}
		ids[variant.ID] = true
	}
	if result.SelectedVariantID != "" && !ids[result.SelectedVariantID] {
		return nil
	}
	return &result
}

// AlignProductVariantImages keeps references on the actual complete catalog URL,
// including a higher-quality copy owned by a different image group.
func AlignProductVariantImages(metadata *ProductVariantMetadata, images []string) *ProductVariantMetadata {
	if metadata == nil {
		return nil
	}
	catalog := map[string]string{}
	for _, source := range images {
		if image, ok := media.ParseProductImage(source); ok {
			catalog[image.Key] = source
		} else {
			catalog[source] = source
		}
	}
	result := *metadata
	result.Variants = make([]ProductColorVariant, 0, len(metadata.Variants))
	for _, variant := range metadata.Variants {
		urls := []string{}
		seen := map[string]bool{}
		for _, source := range variant.ImageURLs {
			key := source
			if image, ok := media.ParseProductImage(source); ok {
				key = image.Key
			}
			if actual := catalog[key]; actual != "" && !seen[actual] {
				urls = append(urls, actual)
				seen[actual] = true
			}
		}
		variant.ImageURLs = urls
		result.Variants = append(result.Variants, variant)
	}
	return &result
}
