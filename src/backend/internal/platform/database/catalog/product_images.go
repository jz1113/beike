package catalog

import (
	"encoding/json"

	"beike.local/cloud/src/backend/internal/platform/media"
)

// Keep the list cover on the same best-quality URL selected for its resource.
func cleanProductCover(source string, detailURLs any) string {
	cover, _, _ := media.ProductImageGroups([]string{source}, nil, nil)
	text, _ := detailURLs.(string)
	var groups struct {
		Main, Skus, Details []string
	}
	_ = json.Unmarshal([]byte(text), &groups)
	requested, valid := media.ParseProductImage(source)
	first := ""
	for _, addresses := range [][]string{groups.Main, groups.Skus, groups.Details} {
		for _, address := range addresses {
			if first == "" {
				first = address
			}
			image, ok := media.ParseProductImage(address)
			if (valid && ok && image.Key == requested.Key) || address == source {
				return address
			}
		}
	}
	if len(cover) > 0 {
		return cover[0]
	}
	return first
}
