package workshop

import (
	"encoding/json"
	"testing"
)

func TestNewBatchKeepsPreferencesAndClearsProductBindings(t *testing.T) {
	previous := `{"items":[{"id":"old"}],"settings":{"selectedVisionModel":"vision","selectedImageGenModel":"image","selectedAspect":"1:1","selectedQuality":"medium","generationStrategy":"single_shot","lockedFullPromptId":"old-reference"}}`
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(emptyBatchWithPreferences(previous)), &snapshot); err != nil {
		t.Fatal(err)
	}
	settings := snapshot["settings"].(map[string]any)
	for key, value := range map[string]string{"selectedVisionModel": "vision", "selectedImageGenModel": "image", "selectedAspect": "1:1", "selectedQuality": "medium", "generationStrategy": "single_shot", "lockedFullPromptId": "auto"} {
		if settings[key] != value {
			t.Fatalf("%s: %v", key, settings[key])
		}
	}
	if len(snapshot["items"].([]any)) != 0 {
		t.Fatal("new batch inherited old products")
	}
}
