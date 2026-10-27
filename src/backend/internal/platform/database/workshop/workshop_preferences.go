package workshop

import "encoding/json"

// Keep model and image preferences; each new batch starts with four-shot grid output.
func emptyBatchWithPreferences(previous string) string {
	var old, next map[string]any
	if json.Unmarshal([]byte(previous), &old) != nil {
		return emptyBatchSnapshot()
	}
	if json.Unmarshal([]byte(emptyBatchSnapshot()), &next) != nil {
		return emptyBatchSnapshot()
	}
	saved, _ := old["settings"].(map[string]any)
	settings := next["settings"].(map[string]any)
	for _, name := range []string{"selectedVisionModel", "selectedImageGenModel", "selectedQuality", "selectedAspect", "gridOutputSize"} {
		if value, exists := saved[name]; exists {
			settings[name] = value
		}
	}
	raw, _ := json.Marshal(next)
	return string(raw)
}
