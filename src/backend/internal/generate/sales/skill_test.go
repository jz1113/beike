package sales

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSalesStagesReceiveInstalledSkillAndReturnItsRevision(t *testing.T) {
	for _, tc := range []struct {
		stage, reply string
		handler      http.Handler
	}{
		{"analyze", salesAnalysisJSON, Analyze(config.Config{})},
		{"script", validWorkflowScript(), Script(config.Config{})},
		{"select", `{"assignments":[{"shotId":1,"imageIndex":2,"reason":"对应视角"}]}`, Select(config.Config{})},
		{"finalize", `{"fullPrompt":"看看这款纸巾","prompts":[{"shotId":1,"speechMode":"voiceover","prompt":"看看这款纸巾"}]}`, Finalize(config.Config{})},
	} {
		t.Run(tc.stage, func(t *testing.T) {
			server := useChatServer(t, func(body map[string]any, _ int) string {
				messages := body["messages"].([]any)
				prompt := messages[0].(map[string]any)["content"].(string)
				if !strings.Contains(prompt, salesSkillInstructions(tc.stage)) {
					t.Fatal("model did not receive the installed skill's current stage")
				}
				return tc.reply
			})
			payload := workflowPayload()
			payload["skillId"], payload["skillRevision"] = installedSalesSkill.ID, installedSalesSkill.Revision
			payload["operation"] = "finalize"
			attachGateway(payload, server.URL)
			rec := postSales(t, tc.handler, "/", payload)
			var response map[string]any
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &response) != nil {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			if response["skillId"] != installedSalesSkill.ID || response["skillRevision"] != installedSalesSkill.Revision {
				t.Fatal("response did not attest the executed skill revision")
			}
		})
	}
}

func TestSalesRejectsUnknownOrStaleExplicitSkillBeforeModel(t *testing.T) {
	for _, handler := range []http.Handler{Analyze(config.Config{}), Script(config.Config{}), Select(config.Config{}), Finalize(config.Config{})} {
		for _, selection := range [][2]string{{"other-skill", installedSalesSkill.Revision}, {installedSalesSkill.ID, "old"}, {installedSalesSkill.ID, ""}} {
			payload := workflowPayload()
			payload["skillId"], payload["skillRevision"] = selection[0], selection[1]
			rec := postSales(t, handler, "/", payload)
			if rec.Code != 400 || !strings.Contains(rec.Body.String(), "规则版本") {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
		}
	}
}

func TestSalesAnalysisMergeAndFinalizeRetainSkillFacts(t *testing.T) {
	merged, _ := json.Marshal(summarizeAnalysisBody("model", analysisFacts{}, "已有分析"))
	if !strings.Contains(string(merged), installedSalesSkill.Revision) {
		t.Fatal("analysis merging lost the selected skill")
	}
	payload := map[string]any{"productAnalysis": `{"knownFacts":["原始资料确认的棉含量"]}`, "productDescription": "原始商品属性及未知项"}
	body, _ := json.Marshal(workflowFinalizeBody("model", payload, nil, nil, nil, 15, "16:9"))
	for _, fact := range []string{"原始资料确认的棉含量", "原始商品属性及未知项"} {
		if !strings.Contains(string(body), fact) {
			t.Fatalf("final model lost factual input: %s", fact)
		}
	}
}
