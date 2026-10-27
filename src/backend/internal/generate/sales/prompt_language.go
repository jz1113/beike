package sales

import (
	"fmt"
	"regexp"
	"strings"
)

var salesPromptEnglishWord = regexp.MustCompile(`[A-Za-z][A-Za-z_]*`)

// Protocol aliases are translated only in directing, never in confirmed dialogue.
func chineseSalesDirecting(text string, shots []ScriptShot) string {
	return mapSalesDirecting(text, shots, func(part string) string {
		return salesPromptEnglishWord.ReplaceAllStringFunc(part, func(word string) string {
			if chinese := installedSalesSkill.Directives["promptTerms"][strings.ToLower(word)]; chinese != "" {
				return chinese
			}
			return word
		})
	})
}

func validateChineseSalesDirecting(full string, prompts []finalPrompt, shots []ScriptShot) error {
	texts := []string{full}
	for _, prompt := range prompts {
		texts = append(texts, prompt.Prompt)
	}
	for _, text := range texts {
		found := false
		mapSalesDirecting(text, shots, func(part string) string {
			found = found || salesPromptEnglishWord.MatchString(part)
			return ""
		})
		if found {
			return fmt.Errorf("定稿画面说明中含英文，请使用中文后重新定稿；已确认的台词原文保持不变")
		}
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
