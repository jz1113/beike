package headline

import (
	"beike.local/cloud/src/backend/internal/generate"
	"strings"
)

func validateCoverDesign(raw map[string]any, coverTitle, productName string) (map[string]any, string) {
	lines := titleLinesOf(raw, coverTitle)
	for _, field := range []string{"composition", "material", "palette", "typographySystem", "typography", "visualAnchor", "styleFamily", "imagePrompt", "layout", "typeface", "textColor", "background", "subject", "harmony", "variation"} {
		text := strings.TrimSpace(generate.TextField(raw, field))
		if text == "" || len(text) > 6000 {
			return nil, "设计方案缺少 " + field + "，未提交生图"
		}
	}
	imagePrompt := strings.TrimSpace(generate.TextField(raw, "imagePrompt"))
	productLine := strings.TrimSpace(generate.TextField(raw, "productNameLine"))
	if productName != "" && productLine != productName || productName == "" && productLine != "" {
		return nil, "设计模型没有原样使用用户提供的商品名称/型号，未提交生图"
	}
	locked := imagePrompt + "\n\n【标题文字锁定】最终主标题必须逐字使用「" + coverTitle + "」，固定分行：" + lockedLines(lines) + "。"
	if productName != "" {
		locked += "商品名称/型号仅使用「" + productName + "」。"
	}
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
	if lines, ok := raw["titleLines"].([]any); ok && len(lines) >= 1 && len(lines) <= 3 {
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
	if len(runes) <= 8 {
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
