package sales

import (
	"errors"
	"regexp"
	"strings"
)

var summaryPromises = regexp.MustCompile(`保证[^。；\n]{0,12}(版型|稳定|耐用|安全)|不(易|容易)[^。；\n]{0,8}(松垮|变形|走形|起球|褪色)|(拉长|修饰)[^。；\n]{0,6}(颈部|身形|身材|腿部)|显瘦|亲测|我用过|回购无数`)
var summaryClothing = regexp.MustCompile(`针织|毛衣|衬衫|上衣|外套|裙|裤|服装|绵羊毛|罗纹`)
var summaryClothingFeel = regexp.MustCompile(`轻盈|不闷|亲肤|不扎|保暖|不厚重|轻便`)
var summaryCareTemperature = regexp.MustCompile(`手洗[^。；;]{0,12}(?:不高于|≤)(\d{1,3})(?:℃|°C|°c)`)
var summaryIronTemperature = regexp.MustCompile(`(?:熨斗|熨烫)[^。；;]{0,10}(?:不高于|≤)(\d{1,3})(?:℃|°C|°c)`)
var summaryConflictDecision = regexp.MustCompile(`(已|优先)(采用|采信|选择)`)

func validateSummaryCopyPoints(result summaryResult) error {
	if len(result.Points) == 0 && strings.TrimSpace(result.Copy) != "" {
		return errors.New("没有有效买点时不能生成通用推荐文案")
	}
	if len(result.Points) > 0 && len(result.CopyPointIndexes) == 0 {
		return errors.New("推荐文案缺少所依据的买点，请按已提炼买点生成")
	}
	if len(result.CopyPointIndexes) > 3 {
		return errors.New("推荐文案应围绕最多3个核心买点展开")
	}
	seen := map[int]bool{}
	for _, index := range result.CopyPointIndexes {
		if index < 1 || index > len(result.Points) || seen[index] {
			return errors.New("推荐文案引用了不存在或重复的买点")
		}
		seen[index] = true
	}
	return nil
}

func summarySourceText(input summaryInput) string {
	parts := []string{input.ProductName, input.Facts}
	for _, source := range input.TextImages {
		parts = append(parts, source.Text)
	}
	return strings.Join(parts, "\n")
}

// Keep explicit label restrictions independently of the model's marketing copy.
func summaryLabelCautions(input summaryInput) []string {
	flat := strings.Join(strings.Fields(summarySourceText(input)), "")
	flat = strings.ReplaceAll(flat, "℃℃", "℃")
	cautions := []string{}
	seen := map[string]bool{}
	for _, match := range summaryCareTemperature.FindAllStringSubmatch(flat, -1) {
		note := "按标签手洗，水温不高于" + match[1] + "℃"
		if !seen[note] {
			cautions = append(cautions, note)
			seen[note] = true
		}
	}
	for _, label := range []string{"不可干洗", "不可翻转干燥", "不可漂白", "在阴凉处平摊晾干"} {
		if strings.Contains(flat, label) {
			cautions = append(cautions, label)
		}
	}
	for _, match := range summaryIronTemperature.FindAllStringSubmatch(flat, -1) {
		note := "熨斗底板温度不高于" + match[1] + "℃"
		if !seen[note] {
			cautions = append(cautions, note)
			seen[note] = true
		}
	}
	if len(cautions) > 6 {
		cautions = cautions[:6]
	}
	return cautions
}

func reviewSummaryResult(result *summaryResult, input summaryInput) error {
	text := []string{result.Summary, result.Copy}
	for _, point := range result.Points {
		text = append(text, point.Feature, point.Benefit, point.Expression)
	}
	output := strings.Join(text, "\n")
	if summaryPromises.MatchString(output) {
		return errors.New("成稿包含未经证明的效果、耐用性或身体修饰承诺")
	}
	sources := summarySourceText(input)
	if summaryClothing.MatchString(sources) {
		for _, claim := range summaryClothingFeel.FindAllString(output, -1) {
			if !strings.Contains(sources, claim) {
				return errors.New("成稿把服装成分或外观推成了未提供的触感、重量或保暖效果")
			}
		}
	}
	if strings.Contains(output, "弹力") && !strings.Contains(sources, "弹力") {
		return errors.New("成稿把可见罗纹推成了未提供的弹力性能")
	}
	for _, conflict := range result.Conflicts {
		if summaryConflictDecision.MatchString(conflict) {
			return errors.New("模型自行裁决了资料冲突，相关事实需要人工确认")
		}
	}
	notes := summaryLabelCautions(input)
	for _, note := range result.Cautions {
		found := false
		for _, existing := range notes {
			if existing == note {
				found = true
				break
			}
		}
		if !found && len(notes) < 6 {
			notes = append(notes, note)
		}
	}
	result.Cautions = notes
	return nil
}
