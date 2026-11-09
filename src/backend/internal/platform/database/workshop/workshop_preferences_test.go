package workshop

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"
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

func TestWorkshopBatchNaming(t *testing.T) {
	for _, name := range []string{"", "未命名新批次", "未命名批次"} {
		if got := workshopBatchName("batch_a12345", name, "2026-10-01T23:00:00.000Z"); got != "电商图片 · 20261002 · A12345" {
			t.Fatalf("unexpected default name: %s", got)
		}
	}
	if got := workshopBatchName("batch_a12345", "未命名的秋季方案", "2026-10-01T00:00:00Z"); got != "未命名的秋季方案" {
		t.Fatalf("custom name changed: %s", got)
	}
}

func TestWorkshopBatchCopyNameFitsContract(t *testing.T) {
	source := WorkshopBatchRow{Name: strings.Repeat("图", 120)}
	name := workshopBatchCopyName(source)
	if utf8.RuneCountInString(name) != 120 || !strings.HasSuffix(name, "（副本）") {
		t.Fatalf("invalid copy name: %s", name)
	}
	source.Name = name
	if got := workshopBatchCopyName(source); got != name {
		t.Fatalf("copy suffix accumulated: %s", got)
	}
}

func TestDuplicatePendingCollectionKeepsInput(t *testing.T) {
	input := "https://item.jd.com/123456789.html"
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(duplicateSnapshot(`{"items":[],"batchInputText":"`+input+`"}`)), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot["batchInputText"] != input {
		t.Fatalf("pending collection input lost: %#v", snapshot)
	}
}
