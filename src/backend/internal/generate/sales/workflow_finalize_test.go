package sales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestWorkflowActualReferenceIntegrity(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"duplicate IDs", func(p map[string]any) {
			refs := p["actualReferences"].([]map[string]any)
			refs[1]["id"] = "product_white"
		}},
		{"empty URL", func(p map[string]any) { refs := p["actualReferences"].([]map[string]any); refs[1]["url"] = "" }},
		{"unknown kind", func(p map[string]any) { refs := p["actualReferences"].([]map[string]any); refs[1]["kind"] = "alien" }},
		{"ineligible product", func(p map[string]any) {
			refs := p["actualReferences"].([]map[string]any)
			refs[0]["url"] = "https://example.com/red.jpg"
		}},
		{"relabel ineligible product", func(p map[string]any) {
			refs := p["actualReferences"].([]map[string]any)
			refs[1]["url"] = "https://example.com/red.jpg"
		}},
		{"ineligible shot", func(p map[string]any) { shots := p["shots"].([]map[string]any); shots[0]["imageIndex"] = 9 }},
		{"null shot index", func(p map[string]any) {
			p["imageCatalog"] = []map[string]any{{"index": 0, "url": "a", "role": "main"}}
			p["eligibleImageIndexes"] = []int{0}
			p["shots"].([]map[string]any)[0]["imageIndex"] = nil
		}},
		{"missing shot index", func(p map[string]any) { shots := p["shots"].([]map[string]any); delete(shots[0], "imageIndex") }},
		{"missing required plan ID", func(p map[string]any) {
			p["assets"] = []PlannedAsset{{ID: "person", Kind: "person", Label: "人物", Prompt: "人物", Required: true}}
		}},
		{"unknown operation", func(p map[string]any) { p["operation"] = "unknown" }},
		{"missing operation", func(p map[string]any) { delete(p, "operation") }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			payload := workflowPayload()
			payload["operation"] = "finalize"
			tc.mutate(payload)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			if rec.Code != 400 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowFashionFinalizesOneVideoWithoutStillPrompts(t *testing.T) {
	for _, category := range []string{"fashion"} {
		t.Run(category, func(t *testing.T) {
			server := useChatServer(t, func(body map[string]any, _ int) string {
				encoded, _ := json.Marshal(body)
				text := string(encoded)
				if body["max_tokens"] != float64(longOutputTokens) {
					t.Errorf("max_tokens %#v", body["max_tokens"])
				}
				for _, expected := range []string{"white.jpg", "table.jpg", "图片1", "图片2", "0–15秒", "16:9", "无字幕"} {
					if !strings.Contains(text, expected) {
						t.Errorf("missing %s", expected)
					}
				}
				for _, forbidden := range []string{"red.jpg", "personImagePrompt", "sceneImagePrompt", "9:16", "720p", "1080p"} {
					if strings.Contains(text, forbidden) {
						t.Errorf("unexpected %s", forbidden)
					}
				}
				if category == "fashion" {
					for _, expected := range []string{"语速略慢", "生活 vlog", "嘴型与原文对齐"} {
						if !strings.Contains(text, expected) {
							t.Errorf("fashion finalize missing %s", expected)
						}
					}
				} else if strings.Contains(text, "语速略慢") || strings.Contains(text, "生活 vlog") {
					t.Errorf("non-fashion finalize included the fashion architecture")
				}
				return `{"fullPrompt":"实拍桌面，保持白色商品，看看这款纸巾","prompts":[{"shotId":1,"prompt":"展示白色商品，看看这款纸巾"}]}`
			})
			payload := workflowPayload()
			payload["operation"] = "finalize"
			payload["category"] = category
			attachGateway(payload, server.URL)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			if rec.Code != 200 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
			for _, expected := range []string{"fullPrompt", "prompts", "图片1", "图片2", "16:9", "0–15秒", "白色"} {
				if !strings.Contains(rec.Body.String(), expected) {
					t.Errorf("response missing %s", expected)
				}
			}
		})
	}
}

func TestWorkflowFinalizeRejectsTimingBeforeModel(t *testing.T) {
	payload := workflowPayload()
	payload["operation"] = "finalize"
	payload["targetDuration"] = 16
	rec := postSales(t, Finalize(config.Config{}), "/", payload)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "总时长") {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowFinalizeRejectsIncompletePromptIDs(t *testing.T) {
	for _, reply := range []string{`{"fullPrompt":"图片3出现","prompts":[{"shotId":1,"prompt":"本段"}]}`, `{"fullPrompt":"整段","prompts":[]}`, `{"fullPrompt":"整段","prompts":[{"shotId":2,"prompt":"未知编号"}]}`, `{"prompts":[{"shotId":1,"prompt":"缺整段"}]}`} {
		t.Run(reply, func(t *testing.T) {
			server := useChatServer(t, func(map[string]any, int) string { return reply })
			payload := workflowPayload()
			payload["operation"] = "finalize"
			attachGateway(payload, server.URL)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			if rec.Code != 502 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}
