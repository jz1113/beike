package sales

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAnalysisGroupsAnAlreadyTimedAction(t *testing.T) {
	for _, extra := range []string{
		`"actionTemplate":"抬手，视线随手抬起","beats":[]`,
		`"summary":"0.0–14.8 秒｜抬手，视线随手抬起"`,
	} {
		raw := `{"durationSec":14.8,"shots":[{"start":0,"end":14.8,"estimated":true,"expression":"抬眼","camera":"固定",` + extra + `}]}`
		script, err := parseScriptCompletion(scriptCompletion(raw, "stop"))
		if err != nil {
			t.Fatal(err)
		}
		shot := script["shots"].([]any)[0].(map[string]any)
		beats := shot["beats"].([]any)
		beat := beats[0].(map[string]any)
		if len(beats) != 1 || beat["actionTemplate"] != "抬手，视线随手抬起" && beat["action"] != "抬手，视线随手抬起" || beat["start"] != 0.0 || beat["end"] != 14.8 || beat["estimated"] != true || beat["expression"] != "抬眼" || beat["camera"] != "固定" {
			t.Fatalf("lost timed observation: %+v", beats)
		}
	}
}

func TestAnalysisRecoversRootBeatsOnlyForSingleShot(t *testing.T) {
	raw := `{"durationSec":2,"shots":[{"start":0,"end":2}],"beats":[{"start":0,"end":1,"action":"抬手"},{"start":1,"end":2,"action":"收手"}]}`
	script, err := parseScriptCompletion(scriptCompletion(raw, "stop"))
	if err != nil || len(script["shots"].([]any)[0].(map[string]any)["beats"].([]any)) != 2 {
		t.Fatal("single-shot beats not recovered", err)
	}
	for _, broken := range []string{
		strings.Replace(raw, `"end":2}`, `"end":1},{"start":1,"end":2}`, 1),
		strings.Replace(raw, `"end":1,"action"`, `"end":5,"action"`, 1),
		`{"durationSec":2,"shots":[{"start":0,"end":2,"summary":"开场展示"}]}`,
	} {
		if _, err := parseScriptCompletion(scriptCompletion(broken, "stop")); err == nil {
			t.Fatal("accepted missing or ambiguous timeline", broken)
		}
	}
}

func TestAnalysisRetainsDetailedOneTakeWithoutSplittingOrTruncating(t *testing.T) {
	var beats []map[string]any
	for i := 0; i < 25; i++ {
		beats = append(beats, map[string]any{"start": i, "end": i + 1, "action": "抬手"})
	}
	for _, count := range []int{13, 24, 25} {
		raw, _ := json.Marshal(map[string]any{"durationSec": count, "shots": []any{map[string]any{"start": 0, "end": count, "beats": beats[:count]}}})
		script, err := parseScriptCompletion(scriptCompletion(string(raw), "stop"))
		if count == 25 {
			if err == nil || !strings.Contains(err.Error(), "25 个动作段") {
				t.Fatal("missing actual beat count", err)
			}
			continue
		}
		if err != nil || len(script["shots"].([]any)[0].(map[string]any)["beats"].([]any)) != count {
			t.Fatal("lost motion", count, err)
		}
	}
}
