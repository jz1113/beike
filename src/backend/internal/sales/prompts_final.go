package sales

import (
	_ "embed"
	"fmt"
	"regexp"
	"strings"
)

//go:embed final-video-template.md
var finalVideoTemplate string

//go:embed final-video-depth-template.md
var finalVideoDepthTemplate string

var finalVideoFactPattern = regexp.MustCompile(`\{\{([^{}]*)\}\}`)

var soundLineWithFact = regexp.MustCompile(`(?m)^【仅(无口播|有口播|后期旁白)】[^\r\n]*\{\{`)

func validateFinalVideoPrompt(id, text string) error {
	if id != "final-video" && id != "final-video-depth" {
		return nil
	}
	if strings.Contains(text, "{{{") || strings.Contains(text, "}}}") {
		return fmt.Errorf("最终视频生成规则的占位符格式无效，请使用双花括号事实占位符")
	}
	if soundLineWithFact.MatchString(text) {
		return fmt.Errorf("声音模式行只填写开场文字，请将事实占位符移至公共行")
	}
	keys := []string{"photographyFacts", "timelineFacts", "audioFacts"}
	materialKeys := []string{"personaFacts", "productFacts", "sceneFacts"}
	if id == "final-video-depth" {
		materialKeys = append(materialKeys, "depthFacts")
	}
	allowed := append(append([]string{"referenceFacts"}, keys...), materialKeys...)
	seen := map[string]bool{}
	for _, match := range finalVideoFactPattern.FindAllStringSubmatch(text, -1) {
		name := strings.TrimSpace(match[1])
		known := false
		for _, key := range allowed {
			known = known || name == key
		}
		if !known {
			return fmt.Errorf("最终视频生成规则包含未知占位符：%s", name)
		}
		seen[name] = true
	}
	remainder := finalVideoFactPattern.ReplaceAllString(text, "")
	if strings.Contains(remainder, "{{") || strings.Contains(remainder, "}}") {
		return fmt.Errorf("最终视频生成规则的占位符格式无效，请使用双花括号事实占位符")
	}
	if !seen["referenceFacts"] {
		keys = append(keys, materialKeys...)
	}
	missing := []string{}
	for _, key := range keys {
		if !seen[key] {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("最终视频生成规则缺少事实占位符：%s", strings.Join(missing, "、"))
	}
	return nil
}
