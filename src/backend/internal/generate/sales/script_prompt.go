package sales

import "strings"

func normalizeScriptPresentation(script SalesScript) SalesScript {
	total := 0
	for i := range script.Shots {
		if script.Shots[i].Transition == "" {
			script.Shots[i].Transition = "direct_concat"
		}
		script.Shots[i].VisualSource = keepVisualSource(script.Shots[i].VisualSource)
		total += script.Shots[i].Duration
	}
	script.TotalDuration = total
	if script.ID == "" {
		script.ID = "script_1"
	}
	return script
}

func keepVisualSource(source string) string {
	if strings.TrimSpace(source) == "ai_generate" {
		return "ai_generate"
	}
	return "product_image"
}

func scriptReady(script SalesScript) bool {
	if strings.TrimSpace(script.Title) == "" || len(script.Shots) == 0 {
		return false
	}
	seen := map[int]bool{}
	for _, shot := range script.Shots {
		if shot.ShotId <= 0 || seen[shot.ShotId] {
			return false
		}
		seen[shot.ShotId] = true
		if strings.TrimSpace(shot.Description) == "" || strings.TrimSpace(shot.Voiceover) == "" || strings.TrimSpace(shot.Prompt) == "" {
			return false
		}
	}
	return true
}
