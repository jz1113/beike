package sales

import "testing"

func TestScriptRejectsExplicitSpeechContradiction(t *testing.T) {
	shot := ScriptShot{ShotId: 1, SpeechMode: "on_camera", Voiceover: "看看这件圆领。", Description: "声音来源：旁白。"}
	if err := validateSpeechModes([]ScriptShot{shot}, true); err == nil {
		t.Fatal("accepted a field-only repair that left contradicting directing text")
	}
	shot.Description = "嘴部可见，声音来源：出镜人物现场说话。"
	if err := validateSpeechModes([]ScriptShot{shot}, true); err != nil {
		t.Fatal(err)
	}
}

func TestFinalSpeechRejectsRepetitionAndContradictingSources(t *testing.T) {
	shots := []ScriptShot{{ShotId: 1, SpeechMode: "on_camera", Voiceover: "这件圆领配我这条长裤。"}}
	line := shots[0].Voiceover
	for _, tc := range []struct {
		name, full, mode, segment string
	}{
		{"duplicated full dialogue", line + line, "on_camera", line},
		{"duplicated segment dialogue", line, "on_camera", line + line},
		{"missing source", line, "", line},
		{"changed source", line, "voiceover", line},
		{"contradicting directing text", line, "on_camera", "声音来源：旁白。" + line},
		{"contradicting full prompt", "声音来源：旁白。" + line, "on_camera", line},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateFinalSpeech(tc.full, []finalPrompt{{ShotID: 1, SpeechMode: tc.mode, Prompt: tc.segment}}, shots); err == nil {
				t.Fatal("accepted a final prompt that contradicts the script")
			}
		})
	}
}

func TestFinalSpeechAllowsDeliberateRepeatedLinesAndQuotedSourceWords(t *testing.T) {
	line := "这句话不是旁白：现在看这件圆领。"
	shots := []ScriptShot{{ShotId: 1, SpeechMode: "on_camera", Voiceover: line}, {ShotId: 2, SpeechMode: "on_camera", Voiceover: line}}
	prompts := []finalPrompt{{ShotID: 1, SpeechMode: "on_camera", Prompt: line}, {ShotID: 2, SpeechMode: "on_camera", Prompt: line}}
	if err := validateFinalSpeech(line+line, prompts, shots); err != nil {
		t.Fatal(err)
	}
}
