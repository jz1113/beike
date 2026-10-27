package sales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSpeechModesRejectAmbiguousNewFashionScripts(t *testing.T) {
	for _, mode := range []string{"", "narrator", "on_camera", "voiceover"} {
		t.Run(mode, func(t *testing.T) {
			shots := []ScriptShot{{ShotId: 1, SpeechMode: mode, Voiceover: "今天穿这件出门。"}}
			err := validateSpeechModes(shots, true)
			if (err == nil) != (mode == "on_camera" || mode == "voiceover") {
				t.Fatalf("mode=%q error=%v", mode, err)
			}
		})
	}
	if err := validateSpeechModes([]ScriptShot{{ShotId: 1}}, false); err != nil {
		t.Fatalf("legacy draft should remain readable: %v", err)
	}
	if err := validateSpeechModes([]ScriptShot{{ShotId: 1, SpeechMode: "on_camera"}}, false); err == nil {
		t.Fatal("accepted a speaker without dialogue")
	}
}

func TestSpeakingPlanRequiresAnActualPresenterAsset(t *testing.T) {
	shots := []ScriptShot{{SpeechMode: "on_camera", Voiceover: "今天穿这件。"}}
	assets := []PlannedAsset{{ID: "room", Kind: "scene", Required: true}}
	if err := validateSpeakingAssetPlan(shots, assets); err == nil {
		t.Fatal("accepted an empty room for on-camera speech")
	}
	assets = append(assets, PlannedAsset{ID: "person", Kind: "person", Required: false})
	if err := validateSpeakingAssetPlan(shots, assets); err == nil {
		t.Fatal("accepted an optional, potentially missing presenter")
	}
	assets[1].Required = true
	if err := validateSpeakingAssetPlan(shots, assets); err != nil {
		t.Fatal(err)
	}
	shots[0].SpeechMode = "voiceover"
	if err := validateSpeakingAssetPlan(shots, assets[:1]); err != nil {
		t.Fatal("voiceover should not require a face")
	}
}

func TestFinalizeBindsEachVoiceSourceAndPreservesDialogue(t *testing.T) {
	for _, omit := range []string{"", "full", "segment"} {
		t.Run(omit, func(t *testing.T) {
			payload := workflowPayload()
			payload["operation"] = "finalize"
			payload["category"] = "fashion"
			payload["shots"] = []map[string]any{
				{"shotId": 1, "duration": 8, "imageIndex": 2, "speechMode": "on_camera", "voiceover": "今天穿这件出门。"},
				{"shotId": 2, "duration": 7, "imageIndex": 2, "speechMode": "voiceover", "voiceover": "再给你看看领口。"},
			}
			payload["actualReferences"] = append(payload["actualReferences"].([]map[string]any), map[string]any{
				"id": "person", "kind": "person", "label": "讲解人物", "url": "https://example.com/person.jpg",
			})
			server := useChatServer(t, func(map[string]any, int) string {
				full := "人物说：今天穿这件出门。细节画外音：再给你看看领口。"
				first := "人物中近景说：今天穿这件出门。"
				if omit == "full" {
					full = "商品展示"
				}
				if omit == "segment" {
					first = "人物中近景"
				}
				raw, _ := json.Marshal(map[string]any{"fullPrompt": full, "prompts": []finalPrompt{
					{ShotID: 1, SpeechMode: "on_camera", Prompt: first}, {ShotID: 2, SpeechMode: "voiceover", Prompt: "领口特写，画外音：再给你看看领口。"},
				}})
				return string(raw)
			})
			attachGateway(payload, server.URL)
			rec := postSales(t, Finalize(config.Config{}), "/", payload)
			if omit != "" {
				if rec.Code != 502 || !strings.Contains(rec.Body.String(), "台词原文") {
					t.Fatalf("omitted dialogue should fail: %d %s", rec.Code, rec.Body.String())
				}
				return
			}
			var result struct {
				FullPrompt string        `json:"fullPrompt"`
				Prompts    []finalPrompt `json:"prompts"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &result)
			if rec.Code != 200 || !strings.Contains(result.FullPrompt, "0–8秒") || !strings.Contains(result.FullPrompt, "8–15秒") {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			if !strings.HasPrefix(result.Prompts[0].Prompt, speechDirection("on_camera")) || !strings.HasPrefix(result.Prompts[1].Prompt, speechDirection("voiceover")) {
				t.Fatal("per-shot speech directions were lost")
			}
			for _, line := range []string{"今天穿这件出门。", "再给你看看领口。"} {
				if strings.Count(result.FullPrompt, line) != 1 {
					t.Fatalf("validated dialogue repeated in full prompt: %s", line)
				}
			}
		})
	}
}

func TestFinalizeRejectsMissingPresenterBeforeCallingModel(t *testing.T) {
	payload := workflowPayload()
	payload["operation"] = "finalize"
	payload["shots"].([]map[string]any)[0]["speechMode"] = "on_camera"
	rec := postSales(t, Finalize(config.Config{}), "/", payload)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "缺少实际人物") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestFashionPresentationCannotSilentlyBecomeNarration(t *testing.T) {
	for _, tc := range []struct {
		mode, speech string
		valid        bool
	}{
		{"live_presenter", "on_camera", true},
		{"live_presenter", "voiceover", false},
		{"product_closeup", "voiceover", true},
		{"product_closeup", "on_camera", false},
		{"scene_demo", "on_camera", false},
	} {
		shots := []ScriptShot{{SpeechMode: tc.speech}}
		if err := validateFashionPresentation(shots, tc.mode); (err == nil) != tc.valid {
			t.Fatalf("mode=%s speech=%s err=%v", tc.mode, tc.speech, err)
		}
	}
}

func TestFashionScriptRejectsNarrationForSelectedPresenter(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string { return validWorkflowScript() })
	payload := workflowPayload()
	payload["category"] = "fashion"
	payload["videoMode"] = "live_presenter"
	attachGateway(payload, server.URL)
	rec := postSales(t, Script(config.Config{}), "/", payload)
	if rec.Code != 502 || !strings.Contains(rec.Body.String(), "不能全片画外音") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestFashionScriptRejectsConflictingVoiceoverModes(t *testing.T) {
	for _, mode := range []string{"product_closeup", "scene_demo", "graphic_montage"} {
		t.Run(mode, func(t *testing.T) {
			server := useChatServer(t, func(body map[string]any, _ int) string {
				encoded, _ := json.Marshal(body)
				if !strings.Contains(string(encoded), "严禁任何一段填写") {
					t.Fatalf("missing voiceover-only constraint for %s", mode)
				}
				reply := strings.Replace(validWorkflowScript(), `"speechMode":"voiceover"`, `"speechMode":"on_camera"`, 1)
				return strings.Replace(reply, `"voiceover":"看看纸巾"`, `"voiceover":"家人们，我今天出门就套这件黑色圆领。纯棉的，领口那圈罗纹贴着锁骨。单穿就行，里面加件衬衫也能压住，上班和周末都不用再换。"`, 1)
			})
			payload := workflowPayload()
			payload["category"] = "fashion"
			payload["videoMode"] = mode
			payload["productName"] = "黑色卫衣"
			attachGateway(payload, server.URL)
			rec := postSales(t, Script(config.Config{}), "/", payload)
			if rec.Code != 502 {
				t.Fatalf("%s got %d %s", mode, rec.Code, rec.Body.String())
			}
		})
	}
}
