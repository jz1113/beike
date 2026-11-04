package sales

import (
	"regexp"
	"strings"
)

// Some models put the complete timed action directly on a shot instead of
// nesting it under beats. Reuse the recorded interval; never invent sub-timings.
func groupFlatShotActions(script map[string]any) {
	shots, _ := script["shots"].([]any)
	// With exactly one shot, a top-level beats array has one unambiguous
	// owner. Its timestamps still go through the normal timeline validation.
	rootBeats, _ := script["beats"].([]any)
	for _, raw := range shots {
		shot, _ := raw.(map[string]any)
		if existing := shot["beats"]; existing != nil {
			if beats, ok := existing.([]any); !ok || len(beats) != 0 {
				continue
			}
		}
		if len(rootBeats) > 0 {
			if len(shots) == 1 && shot != nil {
				shot["beats"] = rootBeats
				delete(script, "beats")
			}
			continue
		}
		_, startOK := shot["start"].(float64)
		_, endOK := shot["end"].(float64)
		if !startOK || !endOK {
			continue
		}
		beat := map[string]any{}
		for _, key := range []string{"start", "end", "estimated", "purpose", "shotSize", "camera", "subject", "action", "actionTemplate", "referenceActionRaw", "productVisible", "expression", "scene", "transition", "requiredView", "voice", "subtitle", "shows", "cameraLabel", "sectionLabel", "inferred"} {
			if value, ok := shot[key]; ok {
				beat[key] = value
			}
		}
		action, _ := beat["action"].(string)
		template, _ := beat["actionTemplate"].(string)
		if strings.TrimSpace(action) == "" && strings.TrimSpace(template) == "" {
			// A plain summary may just be a shot title. Only reuse a prompt
			// explicitly identified by the brief's "start–end seconds | text" form.
			summary, _ := shot["summary"].(string)
			match := timedShotPrompt.FindStringSubmatch(strings.TrimSpace(summary))
			if len(match) == 0 || strings.TrimSpace(match[1]) == "" || beat["action"] != nil {
				continue
			}
			beat["action"] = strings.TrimSpace(match[1])
		}
		shot["beats"] = []any{beat}
	}
}

var timedShotPrompt = regexp.MustCompile(`(?s)^\d+(?:\.\d+)?\s*(?:秒|s)?\s*[-–—~至]\s*\d+(?:\.\d+)?\s*(?:秒|s)?\s*[|｜]\s*(.+)$`)
