package sales

import (
	"fmt"
	"strings"
	"testing"
)

func TestFashionVoiceoverUsesNaturalTimingWithoutFixedBudget(t *testing.T) {
	prompt := fashionVoiceoverBudgetPrompt(15)
	for _, forbidden := range []string{"本段约", "全片不超过", "每秒", "不要超过"} {
		if strings.Contains(prompt, forbidden) {
			t.Fatalf("speech prompt still exposes a hard budget: %s", forbidden)
		}
	}
	for _, text := range []string{"我今天先看整体搭配。", "这一段只保留一个有依据的看点。", strings.Repeat("衣", 99)} {
		if err := validateFashionVoiceover([]ScriptShot{{ShotId: 1, Duration: 15, Voiceover: text}}, 15); err != nil {
			t.Fatalf("natural timing should not be rejected: %v", err)
		}
	}
}

func TestFashionVoiceoverRejectsEmptyAndDisallowedCopy(t *testing.T) {
	if err := validateFashionVoiceover(nil, 15); err == nil {
		t.Fatal("accepted missing voiceover segments")
	}
	if err := validateFashionVoiceover([]ScriptShot{{ShotId: 1, Duration: 15, Voiceover: "可以直接入手"}}, 15); err == nil {
		t.Fatal("accepted an empty purchase call")
	}
}

func TestFashionScriptExampleUsesLocalSpeechBudgetsAndDevelopsBeforeClosing(t *testing.T) {
	for _, seconds := range []int{10, 15, 20, 30, 60, 120} {
		for _, mode := range []string{"live_presenter", "product_closeup"} {
			t.Run(fmt.Sprintf("%ds/%s", seconds, mode), func(t *testing.T) {
				example := workflowScriptOutputExample(seconds, "fashion", nil, mode)
				script, _, err := oneSalesScript(example[strings.LastIndex(example, "\n")+1:])
				if err != nil {
					t.Fatal(err)
				}
				if err := exactDuration(script.Shots, seconds); err != nil {
					t.Fatal(err)
				}
				if len(script.Shots) != 3 || script.Shots[0].Type != "hook" || script.Shots[1].Type != "detail" || script.Shots[2].Type != "closing" {
					t.Fatal("example must illustrate development between the opening and closing")
				}
				if strings.Contains(example, "直接输出可念的台词") || strings.Contains(example, "本段约") {
					t.Fatal("example leaked speech-writing metadata into voiceover")
				}
				if script.Shots[0].Description == script.Shots[1].Description || script.Shots[1].Prompt == script.Shots[2].Prompt {
					t.Fatal("example did not develop visual state between segments")
				}
				if err := validateSpeechModes(script.Shots, true); err != nil {
					t.Fatal(err)
				}
				if err := validateFashionPresentation(script.Shots, mode); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}
