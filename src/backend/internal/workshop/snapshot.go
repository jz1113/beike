package workshop

import "math"

func prepareSnapshot(raw map[string]any, mode string) string {
	version, ok := whole(raw["version"])
	if !ok || (version != 1 && version != 2) {
		return "工作区格式不正确"
	}
	snapshotMode, _ := raw["mode"].(string)
	if snapshotMode != mode {
		return "工作区模式不一致"
	}
	stage, ok := whole(raw["currentStage"])
	if !ok || stage < 1 || stage > 4 {
		return "工作区格式不正确"
	}
	text, ok := raw["batchInputText"].(string)
	if !ok || len([]rune(text)) > 100000 {
		return "工作区格式不正确"
	}
	items, ok := raw["items"].([]any)
	if !ok || len(items) > 200 {
		return "工作区格式不正确"
	}
	settings, ok := raw["settings"].(map[string]any)
	if !ok || !validSettings(settings) {
		return "工作区格式不正确"
	}
	if version == 2 {
		pipeline, ok := raw["pipeline"].(map[string]any)
		if !ok || !validPipeline(pipeline) {
			return "工作区格式不正确"
		}
		return ""
	}
	raw["version"] = 2
	raw["pipeline"] = map[string]any{
		"status":             legacyStatus(stage, items),
		"planRevision":       0,
		"storyboardRevision": 0,
		"diversityContext": map[string]any{
			"groupSignatures": []any{},
			"actionIds":       []any{},
			"sceneIds":        []any{},
		},
		"runs": []any{},
	}
	return ""
}

func validSettings(settings map[string]any) bool {
	if _, ok := settings["selectedVisionModel"].(string); !ok {
		return false
	}
	if _, ok := settings["selectedImageGenModel"].(string); !ok {
		return false
	}
	if _, ok := settings["selectedArchId"].(string); !ok {
		return false
	}
	if !oneOf(settings["selectedQuality"], "high", "medium", "low") {
		return false
	}
	if !oneOf(settings["selectedAspect"], "3:4", "1:1", "9:16", "16:9") {
		return false
	}
	count, ok := whole(settings["selectedShotCount"])
	if !ok || count < 1 || count > 100 {
		return false
	}
	if _, ok := settings["useAssetLibrary"].(bool); !ok {
		return false
	}
	if !oneOf(settings["generationStrategy"], "grid_first", "single_shot") {
		return false
	}
	return true
}

func validPipeline(pipeline map[string]any) bool {
	return oneOf(pipeline["status"], "draft", "collecting", "plan_ready", "analyzing", "review_required", "approved", "generating", "qc_required", "partial_failed", "paused", "completed", "cancelled", "archived")
}

func legacyStatus(stage int, items []any) string {
	if len(items) == 0 {
		return "draft"
	}
	if stage == 1 {
		return "collecting"
	}
	if stage == 2 {
		return "plan_ready"
	}
	hasStoryboard := false
	generating := false
	failed := false
	taskCount := 0
	succeeded := true
	for _, item := range items {
		product, ok := item.(map[string]any)
		if !ok {
			continue
		}
		prompts, _ := product["prompts"].([]any)
		if len(prompts) > 0 {
			hasStoryboard = true
		}
		tasks, _ := product["tasks"].([]any)
		for _, rawTask := range tasks {
			taskCount++
			task, ok := rawTask.(map[string]any)
			if !ok {
				succeeded = false
				continue
			}
			status, _ := task["status"].(string)
			if status == "PENDING" || status == "IN_PROGRESS" {
				generating = true
			}
			if status == "FAILURE" {
				failed = true
			}
			if status != "SUCCESS" {
				succeeded = false
			}
		}
	}
	succeeded = succeeded && taskCount > 0
	if stage == 3 {
		if hasStoryboard {
			return "review_required"
		}
		return "analyzing"
	}
	if generating {
		return "generating"
	}
	if failed {
		return "partial_failed"
	}
	if succeeded {
		return "qc_required"
	}
	return "generating"
}

func oneOf(value any, options ...string) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	for _, option := range options {
		if text == option {
			return true
		}
	}
	return false
}

func whole(value any) (int, bool) {
	number, ok := value.(float64)
	if !ok || math.Trunc(number) != number {
		return 0, false
	}
	return int(number), true
}
