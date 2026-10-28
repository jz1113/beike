package sales

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed skill_package.generated.json
var salesSkillJSON []byte

type salesSkillPackage struct {
	ID           string                       `json:"id"`
	Revision     string                       `json:"revision"`
	Stages       map[string]string            `json:"stages"`
	Directives   map[string]map[string]string `json:"directives"`
	SpeechLimits salesSpeechLimits            `json:"speechLimits"`
}

type salesSpeechLimits struct {
	DisallowedPhrases []string `json:"disallowedPhrases"`
}

var installedSalesSkill = loadSalesSkill()

func loadSalesSkill() salesSkillPackage {
	var skill salesSkillPackage
	if err := json.Unmarshal(salesSkillJSON, &skill); err != nil || skill.ID != "fashion-video-sales" || len(skill.Revision) != 64 {
		panic("invalid compiled sales skill; run pnpm skills:build")
	}
	for _, stage := range []string{"analyze", "script", "select", "image", "finalize", "render"} {
		if strings.TrimSpace(skill.Stages[stage]) == "" {
			panic("missing compiled sales skill stage: " + stage)
		}
	}
	if len(skill.SpeechLimits.DisallowedPhrases) == 0 {
		panic("missing compiled sales speech disallowed phrases; run pnpm skills:build")
	}
	return skill
}

func salesSkillStage(stage string) string {
	rules, ok := installedSalesSkill.Stages[stage]
	if !ok {
		panic("unknown sales skill stage: " + stage)
	}
	return rules
}

func salesSkillInstructions(stage string) string {
	return fmt.Sprintf("本次选择技能 %s，规则版本 %s，当前阶段 %s。严格执行以下技能规则中与当前阶段有关的要求；工作室负责阶段调度，只交付当前阶段结果。\n%s", installedSalesSkill.ID, installedSalesSkill.Revision, stage, salesSkillStage(stage))
}

func salesSkillDirective(group, key string) string {
	text := installedSalesSkill.Directives[group][key]
	if strings.TrimSpace(text) == "" {
		panic("missing compiled sales directive: " + group + "." + key)
	}
	return text
}

func checkSalesSkill(payload map[string]any) error {
	// Older callers still execute the sole installed skill. Explicit selections must match.
	id, hasID := payload["skillId"]
	revision, hasRevision := payload["skillRevision"]
	if !hasID && !hasRevision {
		return nil
	}
	if id != installedSalesSkill.ID || revision != installedSalesSkill.Revision {
		return fmt.Errorf("所选创作技能或规则版本与后台不一致，请重启后台服务并刷新页面后更新方案；原任务仍可查询")
	}
	return nil
}

func withSalesSkill(response map[string]any) map[string]any {
	response["skillId"] = installedSalesSkill.ID
	response["skillRevision"] = installedSalesSkill.Revision
	return response
}
