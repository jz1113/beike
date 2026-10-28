package sales

import (
	"fmt"
	"regexp"
	"strings"
)

var salesPromptEnglishWord = regexp.MustCompile(`[A-Za-z][A-Za-z_]*`)
var salesPromptResolution = regexp.MustCompile(`(?i)\b(\d+)\s*[pP]\b`)

type salesPromptLanguageResult struct {
	Text      string
	Converted []string
}

func addSalesLanguageTerm(terms *[]string, term string) {
	term = strings.TrimSpace(term)
	if term == "" {
		return
	}
	for _, existing := range *terms {
		if strings.EqualFold(existing, term) {
			return
		}
	}
	*terms = append(*terms, term)
}

// These tokens are implementation details of the render rules, not English
// directing. Normalize them before the strict language check so a valid
// prompt is not rejected because the runtime rules mention a tool or format.
func normalizeSalesTechnicalTerms(text string, converted *[]string) string {
	text = salesPromptResolution.ReplaceAllStringFunc(text, func(value string) string {
		addSalesLanguageTerm(converted, value)
		match := salesPromptResolution.FindStringSubmatch(value)
		return match[1] + "像素"
	})
	for _, replacement := range []struct {
		pattern *regexp.Regexp
		value   string
	}{
		{regexp.MustCompile(`(?i)\bffmpeg\b`), "视频处理工具"},
		{regexp.MustCompile(`(?i)\bmp4\b`), "视频文件"},
	} {
		if replacement.pattern.MatchString(text) {
			for _, match := range replacement.pattern.FindAllString(text, -1) {
				addSalesLanguageTerm(converted, match)
			}
			text = replacement.pattern.ReplaceAllString(text, replacement.value)
		}
	}
	return text
}

func chineseSalesDirectingWithReport(text string, shots []ScriptShot) salesPromptLanguageResult {
	converted := []string{}
	text = mapSalesDirecting(text, shots, func(part string) string {
		part = normalizeSalesTechnicalTerms(part, &converted)
		return salesPromptEnglishWord.ReplaceAllStringFunc(part, func(word string) string {
			if chinese := installedSalesSkill.Directives["promptTerms"][strings.ToLower(word)]; chinese != "" {
				addSalesLanguageTerm(&converted, word)
				return chinese
			}
			return word
		})
	})
	return salesPromptLanguageResult{Text: text, Converted: converted}
}

// Protocol aliases are translated only in directing, never in confirmed dialogue.
func chineseSalesDirecting(text string, shots []ScriptShot) string {
	return chineseSalesDirectingWithReport(text, shots).Text
}

func validateChineseSalesDirecting(full string, prompts []finalPrompt, shots []ScriptShot) error {
	return validateChineseSalesDirectingWithAllowlist(full, prompts, shots, nil)
}

func validateChineseSalesDirectingWithAllowlist(full string, prompts []finalPrompt, shots []ScriptShot, allowedText []string) error {
	allowed := map[string]bool{}
	for _, value := range allowedText {
		for _, word := range salesPromptEnglishWord.FindAllString(value, -1) {
			allowed[strings.ToLower(word)] = true
		}
	}
	texts := []string{full}
	for _, prompt := range prompts {
		texts = append(texts, prompt.Prompt)
	}
	unknown := []string{}
	for _, text := range texts {
		mapSalesDirecting(text, shots, func(part string) string {
			for _, word := range salesPromptEnglishWord.FindAllString(part, -1) {
				lower := strings.ToLower(word)
				if !allowed[lower] {
					addSalesLanguageTerm(&unknown, word)
				}
			}
			return ""
		})
	}
	if len(unknown) > 0 {
		return fmt.Errorf("定稿画面说明中含未转换英文（%s），请改为中文后重新定稿；台词原文和商品品牌可保留", strings.Join(unknown, "、"))
	}
	return nil
}

func mapSalesDirecting(text string, shots []ScriptShot, transform func(string) string) string {
	var out strings.Builder
	for len(text) > 0 {
		next, dialogue := len(text), ""
		for _, shot := range shots {
			if shot.Voiceover == "" {
				continue
			}
			if index := strings.Index(text, shot.Voiceover); index >= 0 && index < next {
				next, dialogue = index, shot.Voiceover
			}
		}
		out.WriteString(transform(text[:next]))
		out.WriteString(dialogue)
		text = text[next+len(dialogue):]
	}
	return out.String()
}
