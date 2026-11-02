package poster

import (
	"beike.local/cloud/src/backend/internal/generate"
	"regexp"
	"strings"
)

func validateCoverDesign(raw map[string]any, coverTitle, productName string) (map[string]any, string) {
	lines := titleLinesOf(raw, coverTitle)
	if provided, exists := raw["titleLines"]; exists {
		values, ok := provided.([]any)
		joined := ""
		if !ok || len(values) < 1 || len(values) > 2 {
			return nil, "标题分行须为一到两行，未提交生图"
		}
		for _, value := range values {
			line, ok := value.(string)
			if !ok || strings.TrimSpace(line) == "" {
				return nil, "标题分行无效，未提交生图"
			}
			joined += line
		}
		if joined != coverTitle {
			return nil, "标题分行与已确认标题不一致，未提交生图"
		}
	}
	for _, field := range []string{"composition", "material", "palette", "typographySystem", "typography", "visualAnchor", "styleFamily", "imagePrompt", "layout", "typeface", "textColor", "background", "subject", "harmony", "variation"} {
		text := strings.TrimSpace(generate.TextField(raw, field))
		if text == "" || len(text) > 6000 {
			return nil, "设计方案缺少 " + field + "，未提交生图"
		}
	}
	imagePrompt := strings.TrimSpace(generate.TextField(raw, "imagePrompt"))
	if regexp.MustCompile(`参考图\s*[2２二]|图\s*[2２二]|沿用参考图|同款风格|上一张|记忆编号`).MatchString(imagePrompt) {
		return nil, "绘图提示词仍依赖参考封面或历史设计，请改为独立画面描述，未提交生图"
	}
	productLine := strings.TrimSpace(generate.TextField(raw, "productNameLine"))
	if productName != "" && productLine != productName || productName == "" && productLine != "" {
		return nil, "设计模型没有原样使用用户提供的商品名称/型号，未提交生图"
	}
	locked := imagePrompt + "\n\n【标题文字锁定】最终主标题必须逐字使用「" + coverTitle + "」，固定分行：" + lockedLines(lines) + "。"
	if productName != "" {
		locked += "商品名称/型号仅使用「" + productName + "」。"
	}
	locked += "除以上逐项列明的文字和原商品标识外，不生成任何额外文字；重要品牌标识、结构与按键不得被标题遮挡。"
	if len(imagePrompt) < 200 || len(imagePrompt) > 6000 {
		return nil, "完整提示词缺少逐行标题或长度异常，未提交生图"
	}
	for _, line := range lines {
		if !strings.Contains(locked, "「"+line+"」") {
			return nil, "完整提示词缺少逐行标题或长度异常，未提交生图"
		}
	}
	if productName != "" && !strings.Contains(locked, "「"+productName+"」") {
		return nil, "完整提示词缺少逐行标题或长度异常，未提交生图"
	}
	return map[string]any{
		"title": coverTitle, "titleLines": lines, "imagePrompt": locked,
		"composition": generate.TextField(raw, "composition"), "material": generate.TextField(raw, "material"),
		"palette": generate.TextField(raw, "palette"), "typography": generate.TextField(raw, "typography"),
		"typographySystem": generate.TextField(raw, "typographySystem"), "artDirectionId": generate.TextField(raw, "artDirectionId"),
		"visualAnchor": generate.TextField(raw, "visualAnchor"), "styleFamily": generate.TextField(raw, "styleFamily"),
		"layout": generate.TextField(raw, "layout"), "typeface": generate.TextField(raw, "typeface"),
		"textColor": generate.TextField(raw, "textColor"), "background": generate.TextField(raw, "background"),
		"subject": generate.TextField(raw, "subject"), "harmony": generate.TextField(raw, "harmony"),
		"variation":       generate.TextField(raw, "variation"),
		"productNameLine": productLine, "eyebrow": "", "supportLine": "",
	}, ""
}

func titleLinesOf(raw map[string]any, coverTitle string) []string {
	if lines, ok := raw["titleLines"].([]any); ok && len(lines) >= 1 && len(lines) <= 2 {
		out := make([]string, 0, len(lines))
		for _, item := range lines {
			text, ok := item.(string)
			if !ok || text == "" {
				out = nil
				break
			}
			out = append(out, text)
		}
		if len(out) > 0 && strings.Join(out, "") == coverTitle {
			return out
		}
	}
	runes := []rune(coverTitle)
	if len(runes) <= 9 {
		return []string{coverTitle}
	}
	mid := len(runes) / 2
	return []string{string(runes[:mid]), string(runes[mid:])}
}

func lockedLines(lines []string) string {
	parts := make([]string, 0, len(lines))
	for index, line := range lines {
		parts = append(parts, "第 "+generate.Itoa(index+1)+" 行「"+line+"」")
	}
	return strings.Join(parts, "；")
}
