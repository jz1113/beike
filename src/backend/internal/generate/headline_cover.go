package generate

import "strings"

func validateCoverDesign(raw map[string]any, coverTitle, requiredArtID, productName string) (map[string]any, string) {
	lines := titleLinesOf(raw, coverTitle)
	if requiredArtID != "" && textField(raw, "artDirectionId") != requiredArtID {
		return nil, "设计模型未遵守本商品的独立艺术字预留，未提交生图"
	}
	for _, field := range []string{"composition", "material", "palette", "typographySystem", "typography", "visualAnchor", "styleFamily", "imagePrompt"} {
		text := strings.TrimSpace(textField(raw, field))
		if text == "" || len(text) > 6000 {
			return nil, "设计方案缺少 " + field + "，未提交生图"
		}
	}
	imagePrompt := strings.TrimSpace(textField(raw, "imagePrompt"))
	productLine := strings.TrimSpace(textField(raw, "productNameLine"))
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
		"composition": textField(raw, "composition"), "material": textField(raw, "material"),
		"palette": textField(raw, "palette"), "typography": textField(raw, "typography"),
		"typographySystem": textField(raw, "typographySystem"), "artDirectionId": textField(raw, "artDirectionId"),
		"visualAnchor": textField(raw, "visualAnchor"), "styleFamily": textField(raw, "styleFamily"),
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
		parts = append(parts, "第 "+itoa(index+1)+" 行「"+line+"」")
	}
	return strings.Join(parts, "；")
}
