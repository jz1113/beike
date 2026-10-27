package sales

import (
	"fmt"
	"strings"
	"testing"
)

func TestFashionPreferredSpeechBudgetStaysInsideAllowedBudget(t *testing.T) {
	for seconds := 10; seconds <= 120; seconds++ {
		low, high := fashionVoiceoverBudget(seconds)
		preferredLow, preferredHigh := fashionPreferredVoiceoverBudget(seconds)
		if preferredLow <= low || preferredLow > preferredHigh || preferredHigh >= high {
			t.Fatalf("%ds: preferred %d–%d, allowed %d–%d", seconds, preferredLow, preferredHigh, low, high)
		}
	}
	for _, tc := range []struct{ seconds, low, high int }{{15, 75, 90}, {20, 100, 120}, {30, 150, 180}} {
		low, high := fashionPreferredVoiceoverBudget(tc.seconds)
		if low != tc.low || high != tc.high {
			t.Fatalf("%ds preferred speech: %d–%d", tc.seconds, low, high)
		}
		// A script at either end of the recommendation must pass actual validation.
		for _, count := range []int{low, high} {
			if err := validateFashionVoiceover([]ScriptShot{{ShotId: 1, Duration: tc.seconds, Voiceover: strings.Repeat("衣", count)}}, tc.seconds); err != nil {
				t.Fatalf("%ds/%d characters: %v", tc.seconds, count, err)
			}
		}
	}
}

func TestFashionSpeechKeepsPausesCompatibleAndRejectsOverloadedShots(t *testing.T) {
	// A previously confirmed, sparse 15s script remains valid after the default changes.
	if err := validateFashionVoiceover([]ScriptShot{{ShotId: 1, Duration: 15, Voiceover: strings.Repeat("衣", 47)}}, 15); err != nil {
		t.Fatal(err)
	}
	// An acceptable whole-video count cannot hide a rushed local passage.
	shots := []ScriptShot{{ShotId: 1, Duration: 2, Voiceover: strings.Repeat("衣", 17)}, {ShotId: 2, Duration: 13, Voiceover: strings.Repeat("衣", 60)}}
	if err := validateFashionVoiceover(shots, 15); err == nil {
		t.Fatal("accepted an overloaded local passage")
	}
	if err := validateFashionVoiceover([]ScriptShot{{ShotId: 1, Duration: 15, Voiceover: strings.Repeat("衣", 99)}}, 15); err == nil {
		t.Fatal("accepted speech beyond the whole-video cap")
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
				for _, shot := range script.Shots {
					low, high := fashionPreferredVoiceoverBudget(shot.Duration)
					prefix := fmt.Sprintf("本段约 %d–%d 个汉字", low, high)
					if !strings.HasPrefix(shot.Voiceover, prefix) {
						t.Fatalf("shot %d reused the whole video's speech budget: %s", shot.ShotId, shot.Voiceover)
					}
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
