package sales

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestScriptCompletionRejectsVisualDataThatBrowserWouldErase(t *testing.T) {
	for _, field := range []string{"styleSummary", "lighting", "cameraFeel", "scene", "subject", "camera", "actionTemplate"} {
		for _, value := range []any{nil, map[string]any{"detail": "左侧窗光"}, []string{"左侧窗光"}, true, 42} {
			var script map[string]any
			_ = json.Unmarshal([]byte(validScript), &script)
			record := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
			if field == "styleSummary" || field == "lighting" || field == "cameraFeel" {
				record = map[string]any{}
				script["visualSpec"] = record
			}
			record[field] = value
			raw, _ := json.Marshal(script)
			if _, err := parseScriptCompletion(scriptCompletion(string(raw), "stop")); err == nil || !strings.Contains(err.Error(), field) {
				t.Fatalf("accepted lossy visual field %s=%T: %v", field, value, err)
			}
		}
	}
}

func TestScriptCompletionKeepsCompleteVisualDescriptions(t *testing.T) {
	var script map[string]any
	_ = json.Unmarshal([]byte(validScript), &script)
	visual := map[string]any{"styleSummary": strings.Repeat("纹", 600), "lighting": strings.Repeat("光", 300), "cameraFeel": strings.Repeat("机", 300)}
	script["visualSpec"] = visual
	beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[0].(map[string]any)
	beat["scene"] = strings.Repeat("景", 600)
	beat["actionTemplate"] = "手先接触衣摆，松开后回落"
	delete(beat, "action")
	raw, _ := json.Marshal(script)
	parsed, err := parseScriptCompletion(scriptCompletion(string(raw), "stop"))
	if err != nil {
		t.Fatal("valid template-only action and visual context rejected", err)
	}
	actual, _ := json.Marshal(parsed)
	if string(actual) != string(raw) {
		t.Fatal("accepted visual descriptions were changed")
	}
	for _, target := range []map[string]any{visual, beat} {
		key, limit := "lighting", 300
		if target["scene"] != nil {
			key, limit = "scene", 600
		}
		target[key] = strings.Repeat("字", limit+1)
		raw, _ := json.Marshal(script)
		if _, err := parseScriptCompletion(scriptCompletion(string(raw), "stop")); err == nil {
			t.Fatalf("oversized %s accepted", key)
		}
		target[key] = strings.Repeat("字", limit)
	}
}

func TestScriptCompletionRejectsEmptyActionBeforeSaving(t *testing.T) {
	broken := strings.Replace(validScript, `"action":"坐姿看镜头"`, `"action":" ","actionTemplate":""`, 1)
	if _, err := parseScriptCompletion(scriptCompletion(broken, "stop")); err == nil || !strings.Contains(err.Error(), "缺少动作模板") {
		t.Fatal("empty motion cannot become a usable reference script", err)
	}
}
