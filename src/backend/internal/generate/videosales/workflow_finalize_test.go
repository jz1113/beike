package videosales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestWorkflowValidatesActualImagesAndProductVisually(t *testing.T) {
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		for _, expected := range []string{"image_url", "white.jpg", "table.jpg", "图片1", "图片2", "selectedColor", "白色", "不能仅凭文字声称通过"} {
			if !strings.Contains(text, expected) {
				t.Errorf("missing %s", expected)
			}
		}
		if strings.Contains(text, "red.jpg") {
			t.Error("disallowed picture sent")
		}
		return `{"validations":[{"id":"table","status":"uncertain","reason":"纸巾外观不可辨认"},{"id":"product_white","status":"passed","reason":"白色包装与原图一致"}]}`
	})
	payload := workflowPayload()
	payload["operation"] = "validate-assets"
	attachGateway(payload, server.URL)
	rec := postSales(t, Finalize(config.Config{}), "/", payload)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"uncertain"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	var result struct {
		Validations []assetValidation `json:"validations"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &result)
	if len(result.Validations) != 2 || result.Validations[0].ID != "product_white" {
		t.Fatal("IDs not returned in reference order")
	}
}

func TestWorkflowAssetValidationRejectsBadOrInventedResults(t *testing.T) {
	replies := []string{
		`{}`, `not JSON`,
		`{"validations":[{"id":"product_white","status":"passed","reason":"白色"}]}`,
		`{"validations":[{"id":"product_white","status":"passed","reason":"白色"},{"id":"other","status":"passed","reason":"不存在"}]}`,
		`{"validations":[{"id":"product_white","status":"passed","reason":"白色"},{"id":"product_white","status":"passed","reason":"重复"}]}`,
		`{"validations":[{"id":"product_white","status":"passed","reason":"白色"},{"id":"table","status":"ok","reason":"未知状态"}]}`,
		`{"validations":[{"id":"product_white","status":"passed","reason":"白色"},{"id":"table","status":"passed","reason":""}]}`,
	}
	for _, reply := range replies {
		t.Run(reply, func(t *testing.T) {
			server := useChatServer(t, func(map[string]any, int) string { return reply })
			payload := workflowPayload()
			payload["operation"] = "validate-assets"
			attachGateway(payload, server.URL)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			if rec.Code != 502 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

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
			payload["operation"] = "validate-assets"
			tc.mutate(payload)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			if rec.Code != 400 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowAllCategoriesFinalizeOneVideoWithoutStillPrompts(t *testing.T) {
	for _, category := range []string{"beauty", "food", "home", "fashion", "tech", "other"} {
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
				return `{"fullPrompt":"实拍桌面，保持白色商品，整段口播","prompts":[{"shotId":1,"prompt":"推近白色商品"}]}`
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
