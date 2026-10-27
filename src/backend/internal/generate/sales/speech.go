package sales

import (
	"fmt"
	"regexp"
	"strings"
)

func speechDirection(mode string) string {
	switch mode {
	case "on_camera":
		return salesSkillDirective("speech", "on_camera")
	case "voiceover":
		return salesSkillDirective("speech", "voiceover")
	default:
		return "声音来源缺失，必须更新脚本后再定稿。"
	}
}

func validateSpeechModes(shots []ScriptShot, required bool) error {
	for _, shot := range shots {
		switch shot.SpeechMode {
		case "":
			if required {
				return fmt.Errorf("第 %d 段缺少 speechMode，请明确出镜说话或画外音", shot.ShotId)
			}
		case "on_camera", "voiceover":
			if strings.TrimSpace(shot.Voiceover) == "" {
				return fmt.Errorf("第 %d 段已指定声音来源但缺少台词", shot.ShotId)
			}
		default:
			return fmt.Errorf("第 %d 段 speechMode 无效，只能为 on_camera 或 voiceover", shot.ShotId)
		}
		if shot.SpeechMode != "" {
			if err := validateExplicitSpeechSource(shot.Description+"\n"+shot.Prompt, shot); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateFinalSpeech(full string, prompts []finalPrompt, shots []ScriptShot) error {
	byID := map[int]finalPrompt{}
	for _, prompt := range prompts {
		byID[prompt.ShotID] = prompt
	}
	expected := map[string]int{}
	for _, shot := range shots {
		prompt := byID[shot.ShotId]
		if !strings.Contains(full, shot.Voiceover) || !strings.Contains(prompt.Prompt, shot.Voiceover) {
			return fmt.Errorf("第 %d 段定稿遗漏或改写台词原文，请重新定稿", shot.ShotId)
		}
		if strings.Count(prompt.Prompt, shot.Voiceover) != 1 {
			return fmt.Errorf("第 %d 段定稿重复台词原文，请每段只写一次", shot.ShotId)
		}
		if prompt.SpeechMode != shot.SpeechMode {
			return fmt.Errorf("第 %d 段定稿声音来源缺失或与脚本冲突，请重新定稿", shot.ShotId)
		}
		if err := validateExplicitSpeechSource(prompt.Prompt, shot); err != nil {
			return err
		}
		expected[shot.Voiceover] = 0
	}
	for line := range expected {
		for _, shot := range shots {
			expected[line] += strings.Count(shot.Voiceover, line)
		}
		if strings.Count(full, line) != expected[line] {
			return fmt.Errorf("完整定稿重复台词原文，请仅在各自时间段保留一次")
		}
	}
	// A global source declaration must also agree when the entire script uses one source.
	if len(shots) > 0 {
		mode, directing, uniform := shots[0].SpeechMode, full, true
		for _, shot := range shots {
			uniform = uniform && shot.SpeechMode == mode
			directing = strings.ReplaceAll(directing, shot.Voiceover, "")
		}
		if uniform {
			if err := validateExplicitSpeechSource(directing, ScriptShot{ShotId: shots[0].ShotId, SpeechMode: mode}); err != nil {
				return err
			}
		}
	}
	return nil
}

var explicitSpeechSource = regexp.MustCompile(`(?:声音来源|speechMode|声音模式)\s*[:：=]\s*["“]?(on_camera|voiceover|画外音|旁白|出镜人物现场说话)|(?:^|[，,。；;\n])\s*(画外音|旁白|出镜口播)\s*[:：]`)

func validateExplicitSpeechSource(text string, shot ScriptShot) error {
	// Dialogue may itself mention a narrator; inspect only the directing text.
	if shot.Voiceover != "" {
		text = strings.ReplaceAll(text, shot.Voiceover, "")
	}
	for _, match := range explicitSpeechSource.FindAllStringSubmatch(text, -1) {
		value := match[1] + match[2]
		mode := "on_camera"
		if value == "voiceover" || value == "画外音" || value == "旁白" {
			mode = "voiceover"
		}
		if mode != shot.SpeechMode {
			return fmt.Errorf("第 %d 段提示词的声音描述与 speechMode 冲突，请重新定稿", shot.ShotId)
		}
	}
	return nil
}

func needsSpeakingAsset(shots []ScriptShot) bool {
	for _, shot := range shots {
		if shot.SpeechMode == "on_camera" {
			return true
		}
	}
	return false
}

func isFashionVoiceoverMode(mode string) bool {
	return mode == "product_closeup" || mode == "graphic_montage" || mode == "scene_demo"
}

func fashionPresentationRule(mode string) string {
	if isFashionVoiceoverMode(mode) {
		return "\n" + strings.ReplaceAll(salesSkillDirective("presentation", "voiceover"), "{{mode}}", mode)
	}
	return "\n" + salesSkillDirective("presentation", "live_presenter")
}

func validateFashionPresentation(shots []ScriptShot, mode string) error {
	if (mode == "" || mode == "live_presenter") && !needsSpeakingAsset(shots) {
		return fmt.Errorf("已选择人物出镜讲解，脚本必须包含 on_camera 出镜说话分镜，不能全片画外音")
	}
	if (mode == "product_closeup" || mode == "graphic_montage" || mode == "scene_demo") && needsSpeakingAsset(shots) {
		return fmt.Errorf("已选择商品、手部或背影展示，请使用画外音；需要人物说话时请选择人物出镜讲解")
	}
	return nil
}
