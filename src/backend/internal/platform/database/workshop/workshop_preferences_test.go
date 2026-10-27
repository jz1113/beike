package workshop

import (
	"encoding/json"
	"testing"
)

func TestNewBatchKeepsPreferencesAndClearsProductBindings(t *testing.T) {
	previous := `{"items":[{"id":"old"}],"settings":{"selectedVisionModel":"vision","selectedImageGenModel":"image","selectedAspect":"1:1","selectedQuality":"medium","generationStrategy":"single_shot","selectedShotCount":8,"lockedFullPromptId":"old-reference","promptGroupFolderId":"old-folder","gridOutputSize":"600x800"}}`
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(emptyBatchWithPreferences(previous)), &snapshot); err != nil {
		t.Fatal(err)
	}
	settings := snapshot["settings"].(map[string]any)
	for key, value := range map[string]string{"selectedVisionModel": "vision", "selectedImageGenModel": "image", "selectedAspect": "1:1", "selectedQuality": "medium", "generationStrategy": "grid_first", "lockedFullPromptId": "auto", "promptGroupFolderId": "auto", "gridOutputSize": "600x800"} {
		if settings[key] != value {
			t.Fatalf("%s: %v", key, settings[key])
		}
	}
	if settings["selectedShotCount"] != float64(4) {
		t.Fatal("new batch must start with a complete four-shot grid")
	}
	if len(snapshot["items"].([]any)) != 0 {
		t.Fatal("new batch inherited old products")
	}
}

func TestInitialBatchAndInvalidPreferencesDefaultToGrid(t *testing.T) {
	for _, raw := range []string{emptyBatchSnapshot(), emptyBatchWithPreferences("invalid")} {
		var snapshot map[string]any
		if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
			t.Fatal(err)
		}
		settings := snapshot["settings"].(map[string]any)
		if settings["generationStrategy"] != "grid_first" || settings["selectedShotCount"] != float64(4) {
			t.Fatal("initial batch must use four-shot grid output")
		}
	}
}

func TestDuplicatePreservesExplicitSingleShotSettings(t *testing.T) {
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(duplicateSnapshot(`{"version":2,"items":[],"settings":{"generationStrategy":"single_shot","selectedShotCount":8}}`)), &snapshot); err != nil {
		t.Fatal(err)
	}
	settings := snapshot["settings"].(map[string]any)
	if settings["generationStrategy"] != "single_shot" || settings["selectedShotCount"] != float64(8) {
		t.Fatal("duplicating a batch must retain its chosen output mode")
	}
}
