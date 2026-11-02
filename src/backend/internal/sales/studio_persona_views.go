package sales

import (
	"encoding/json"
	"strings"
)

// Keep the original identity source separate from generated face/front views.
// A stale explicit main must not silently become a derived image or images[0].
func studioPersonaIdentityURL(dimensions string, images []string, avatar string) string {
	var metadata map[string]json.RawMessage
	if json.Unmarshal([]byte(dimensions), &metadata) != nil {
		return strings.TrimSpace(avatar)
	}
	rawViews, marked := metadata["personaViews"]
	if !marked {
		return strings.TrimSpace(avatar)
	}
	var views map[string]string
	if json.Unmarshal(rawViews, &views) != nil {
		return ""
	}
	main := strings.TrimSpace(views["main"])
	for _, image := range images {
		if main != "" && main == image {
			return main
		}
	}
	return ""
}

// Explicit view labels take precedence over the legacy source-image ordering.
// Only use anchors that still belong to this asset's saved reference images.
func studioPersonaAnchors(dimensions string, images []string, face, body string) (string, string, string) {
	var metadata struct {
		Views map[string]string `json:"personaViews"`
		Voice string            `json:"defaultVoiceId"`
	}
	if json.Unmarshal([]byte(dimensions), &metadata) != nil {
		return face, body, ""
	}
	valid := func(url string) bool {
		if url == "" {
			return false
		}
		for _, image := range images {
			if url == image {
				return true
			}
		}
		return false
	}
	if valid(metadata.Views["face"]) {
		face = metadata.Views["face"]
	} else if valid(metadata.Views["main"]) {
		face = metadata.Views["main"]
	}
	if valid(metadata.Views["front"]) {
		body = metadata.Views["front"]
	} else if valid(metadata.Views["main"]) {
		body = metadata.Views["main"]
	}
	return face, body, strings.TrimSpace(metadata.Voice)
}
