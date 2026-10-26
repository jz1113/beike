package sales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestFashionExamplesKeepNormalDistanceInEveryPresentationMode(t *testing.T) {
	for _, mode := range []string{"", "live_presenter", "product_closeup", "scene_demo", "graphic_montage"} {
		t.Run(mode, func(t *testing.T) {
			example := workflowScriptOutputExample(15, "fashion", nil, mode)
			script, _, err := oneSalesScript(example[strings.LastIndex(example, "\n")+1:])
			if err != nil {
				t.Fatal(err)
			}
			for _, shot := range script.Shots {
				if strings.Contains(shot.Camera, "推近") || strings.Contains(shot.Camera, "特写") || strings.Contains(shot.Camera, "近景") {
					t.Fatalf("mode %s still teaches a close shot: %s", mode, shot.Camera)
				}
				if !strings.Contains(shot.Camera, "中景") && !strings.Contains(shot.Camera, "中全景") {
					t.Fatalf("mode %s has no normal-distance composition: %s", mode, shot.Camera)
				}
			}
			if script.TotalDuration != 15 {
				t.Fatal("framing changed the duration")
			}
		})
	}
}

func TestFashionFramingReachesFinalModelAndSubmittedPrompt(t *testing.T) {
	for _, category := range []string{"fashion"} {
		t.Run(category, func(t *testing.T) {
			server := useChatServer(t, func(body map[string]any, _ int) string {
				messages := body["messages"].([]any)
				user := messages[1].(map[string]any)["content"].([]any)
				text := user[0].(map[string]any)["text"].(string)
				if strings.Contains(text, fashionFramingRules()) != (category == "fashion") {
					t.Fatal("final model did not receive the category's framing rules")
				}
				return `{"fullPrompt":"参考图片保持商品一致，看看这款纸巾","prompts":[{"shotId":1,"prompt":"连续展示，看看这款纸巾"}]}`
			})
			payload := workflowPayload()
			payload["operation"] = "finalize"
			payload["category"] = category
			attachGateway(payload, server.URL)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			var response struct {
				FullPrompt string `json:"fullPrompt"`
			}
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &response) != nil {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			if strings.Contains(response.FullPrompt, fashionFramingRules()) != (category == "fashion") {
				t.Fatal("submitted prompt lost the framing preamble or applied it to another category")
			}
		})
	}
}
