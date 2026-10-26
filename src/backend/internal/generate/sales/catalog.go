package sales

import (
	"fmt"
	"sort"
	"strings"

	"beike.local/cloud/src/backend/internal/generate"
)

// CatalogImage is one collected product picture addressed by its original index.
type CatalogImage struct {
	Index int    `json:"index"`
	URL   string `json:"url"`
	Role  string `json:"role"`
}

// ImageAssignment binds a storyboard shot to one catalog image.
type ImageAssignment struct {
	ShotID     int    `json:"shotId"`
	ImageIndex int    `json:"imageIndex"`
	Reason     string `json:"reason,omitempty"`
}

func parseCatalog(payload map[string]any) []CatalogImage {
	if raw, ok := payload["imageCatalog"].([]any); ok {
		images := make([]CatalogImage, 0, len(raw))
		for _, item := range raw {
			obj, ok := item.(map[string]any)
			if !ok {
				continue
			}
			url := strings.TrimSpace(generate.StringField(obj, "url"))
			if url == "" {
				continue
			}
			role := strings.TrimSpace(generate.StringField(obj, "role"))
			images = append(images, CatalogImage{Index: generate.IntField(obj, "index"), URL: url, Role: normalizeRole(role)})
		}
		if len(images) > 0 {
			return images
		}
	}
	return nil
}

func normalizeRole(role string) string {
	switch role {
	case "main", "sku", "detail":
		return role
	default:
		return "detail"
	}
}

// LimitVisionImages keeps main images, then SKU images, then a few detail images.
func LimitVisionImages(images []CatalogImage, limit int) []CatalogImage {
	if limit <= 0 {
		limit = 8
	}
	rank := map[string]int{"main": 0, "sku": 1, "detail": 2}
	seen := map[string]bool{}
	filtered := make([]CatalogImage, 0, len(images))
	for _, image := range images {
		url := strings.TrimSpace(image.URL)
		if url == "" || seen[url] {
			continue
		}
		seen[url] = true
		image.URL = url
		image.Role = normalizeRole(image.Role)
		filtered = append(filtered, image)
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if rank[filtered[i].Role] != rank[filtered[j].Role] {
			return rank[filtered[i].Role] < rank[filtered[j].Role]
		}
		return filtered[i].Index < filtered[j].Index
	})
	if len(filtered) > limit {
		filtered = filtered[:limit]
	}
	return filtered
}

// ApplyStrictAssignments accepts only complete picks that exist in the catalog.
func ApplyStrictAssignments(shots []ScriptShot, assignments []ImageAssignment, catalog []CatalogImage) ([]ScriptShot, error) {
	valid := map[int]bool{}
	for _, image := range catalog {
		valid[image.Index] = true
	}
	byShot := map[int]ImageAssignment{}
	expected := map[int]bool{}
	for _, shot := range shots {
		expected[shot.ShotId] = true
	}
	for _, item := range assignments {
		if !expected[item.ShotID] || byShot[item.ShotID].ShotID != 0 {
			return nil, fmt.Errorf("未知或重复的镜头编号 %d", item.ShotID)
		}
		if !valid[item.ImageIndex] {
			return nil, fmt.Errorf("图片编号 %d 不在素材目录中", item.ImageIndex)
		}
		if strings.TrimSpace(item.Reason) == "" {
			return nil, fmt.Errorf("镜头 %d 没有选择理由", item.ShotID)
		}
		byShot[item.ShotID] = item
	}
	out := append([]ScriptShot(nil), shots...)
	for i := range out {
		item, ok := byShot[out[i].ShotId]
		if !ok {
			return nil, fmt.Errorf("镜头 %d 没有配图", out[i].ShotId)
		}
		out[i].ImageIndex = item.ImageIndex
		out[i].SelectionReason = strings.TrimSpace(item.Reason)
		out[i].VisualSource = keepVisualSource(out[i].VisualSource)
	}
	return out, nil
}
