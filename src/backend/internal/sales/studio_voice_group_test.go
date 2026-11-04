package sales

import "testing"

func TestVoiceGroupRoundTrip(t *testing.T) {
	for group, label := range voiceGroupLabels {
		tags := mergeVoiceTags(group, []string{"儿童", "中年女", "温暖"})
		if len(tags) != 2 || tags[0] != label || tags[1] != "温暖" {
			t.Fatalf("%s: unexpected tags %v", group, tags)
		}
		if got := normalizeVoiceGroup(voiceGroupGender(group), "", tags, "老年音色", ""); got != group {
			t.Fatalf("%s: read back %s", group, got)
		}
	}
	if got := normalizeVoiceGroup("male", "", []string{"儿童"}, "", ""); got != "child_male" {
		t.Fatalf("legacy child voice: %s", got)
	}
}
