package media

import "strings"

// ProductImageGroups assigns ownership in main > skus > details order and uses
// the best usable URL for each resource across all groups. Equal-quality URLs
// retain first appearance; comparison keys never become download URLs.
func ProductImageGroups(main, skus, details []string) ([]string, []string, []string) {
	type entry struct {
		image ProductImage
		group int
	}
	entries := []entry{}
	indices := map[string]int{}
	for group, values := range [][]string{main, skus, details} {
		for _, value := range values {
			image, ok := ParseProductImage(value)
			if !ok {
				// Grouping also serves saved user materials; the remote collector
				// parser remains HTTP-only and cannot extract local addresses.
				source := NormalizeImageURLToStandardJpg(value)
				lower := strings.ToLower(source)
				local := strings.HasPrefix(lower, "data:image/") || strings.HasPrefix(lower, "blob:") || (strings.HasPrefix(source, "/") && !strings.HasPrefix(source, "//"))
				if !local || !IsProductImageURL(source) {
					continue
				}
				image = ProductImage{URL: source, Key: source, Quality: 10000}
			}
			if index, exists := indices[image.Key]; exists {
				previous := entries[index].image
				if (!image.Small && previous.Small) || (image.Small == previous.Small && image.Quality > previous.Quality) {
					entries[index].image = image
				}
			} else {
				indices[image.Key] = len(entries)
				entries = append(entries, entry{image, group})
			}
		}
	}
	groups := [3][]string{{}, {}, {}}
	for _, entry := range entries {
		if !entry.image.Small {
			groups[entry.group] = append(groups[entry.group], entry.image.URL)
		}
	}
	return groups[0], groups[1], groups[2]
}
