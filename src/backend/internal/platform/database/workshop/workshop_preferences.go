package workshop

import "encoding/json"

// Copy only generation preferences; product bindings and pipeline state start fresh.
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
	for _, name := range []string{"selectedVisionModel", "selectedImageGenModel", "selectedQuality", "selectedAspect", "generationStrategy", "gridOutputSize"} {
		if value, exists := saved[name]; exists {
			settings[name] = value
		}
	}
	raw, _ := json.Marshal(next)
	return string(raw)
}
