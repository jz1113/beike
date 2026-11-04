package sales

import (
	"fmt"
	"strings"
)

// Optional historical fields remain optional, but provided visual data must not
// pass as objects/null and then disappear during browser normalization.
func validateScriptVisualFields(object map[string]any) error {
	checkText := func(record map[string]any, key, label string, limit int) error {
		value, exists := record[key]
		if !exists {
			return nil
		}
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("%s（%s）必须为字符串", label, key)
		}
		if len([]rune(text)) > limit {
			return fmt.Errorf("%s（%s）超过 %d 字，请精简后重试", label, key, limit)
		}
		return nil
	}
	if raw, exists := object["visualSpec"]; exists {
		visual, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("全局摄影描述（visualSpec）必须为对象")
		}
		for key, limit := range map[string]int{"styleSummary": 600, "lighting": 300, "cameraFeel": 300} {
			if err := checkText(visual, key, "全局摄影描述", limit); err != nil {
				return err
			}
		}
	}
	shots, _ := object["shots"].([]any)
	for shotIndex, rawShot := range shots {
		shot, _ := rawShot.(map[string]any)
		if raw, exists := shot["analysis"]; exists {
			analysis, ok := raw.(map[string]any)
			if !ok {
				return fmt.Errorf("镜头 %d 的分镜分析必须为对象", shotIndex+1)
			}
			for _, key := range []string{"style", "subject", "action", "camera", "expression"} {
				if err := checkText(analysis, key, fmt.Sprintf("镜头 %d 的分镜分析", shotIndex+1), 300); err != nil {
					return err
				}
			}
		}
		beats, _ := shot["beats"].([]any)
		for beatIndex, rawBeat := range beats {
			beat, _ := rawBeat.(map[string]any)
			label := fmt.Sprintf("镜头 %d 动作段 %d 的画面描述", shotIndex+1, beatIndex+1)
			if value, exists := beat["productVisible"]; exists {
				if _, ok := value.(bool); !ok {
					return fmt.Errorf("%s（productVisible）必须为布尔值", label)
				}
			}
			for key, limit := range map[string]int{
				"shotSize": 120, "camera": 500, "subject": 800,
				"action": 1500, "actionTemplate": 1500, "referenceActionRaw": 1500,
				"scene": 600, "expression": 600, "transition": 400,
				"sectionLabel": 80, "cameraLabel": 80, "shows": 800,
			} {
				if err := checkText(beat, key, label, limit); err != nil {
					return err
				}
			}
			action, _ := beat["action"].(string)
			template, _ := beat["actionTemplate"].(string)
			if strings.TrimSpace(action) == "" && strings.TrimSpace(template) == "" {
				return fmt.Errorf("镜头 %d 的动作段 %d 缺少动作模板描述", shotIndex+1, beatIndex+1)
			}
		}
	}
	return nil
}
