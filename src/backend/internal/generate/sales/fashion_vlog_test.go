package sales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestFashionFinalizeKeepsScriptedSceneCuts(t *testing.T) {
	shots := []map[string]any{
		{"shotId": 1, "imageIndex": 2, "duration": 7, "description": "室内确认搭配", "camera": "固定中景", "speechMode": "on_camera", "voiceover": "今天就穿这件出门", "prompt": "图片2室内讲述", "visualSource": "ai_generate"},
		{"shotId": 2, "imageIndex": 2, "duration": 8, "description": "切至街边向前走", "camera": "朋友保持距离跟拍中全景", "speechMode": "voiceover", "voiceover": "走到街边继续往前", "prompt": "硬切图片3街边，同一人物", "visualSource": "ai_generate"},
	}
	full := "0–7秒：图片2，室内固定中景，今天就穿这件出门。7–15秒：硬切图片3街边，朋友保持距离跟拍中全景，画外音：走到街边继续往前。"
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		request := string(encoded)
		for _, expected := range []string{"同空间切镜", "短途日常动线", "【场景与道具】", "新地点不搬入原人物图的背景"} {
			if !strings.Contains(request, expected) {
				t.Errorf("model request missing %s", expected)
			}
		}
		reply, _ := json.Marshal(map[string]any{"fullPrompt": full, "prompts": []finalPrompt{
			{ShotID: 1, SpeechMode: "on_camera", Prompt: "图片2固定中景，今天就穿这件出门"},
			{ShotID: 2, SpeechMode: "voiceover", Prompt: "硬切图片3街边，朋友保持距离跟拍，走到街边继续往前"},
		}})
		return string(reply)
	})
	payload := workflowPayload()
	payload["operation"], payload["videoMode"], payload["shots"] = "finalize", "live_presenter", shots
	payload["assets"] = []PlannedAsset{{ID: "person", Kind: "person", Label: "人物", Prompt: "家中人物", Required: true}, {ID: "street", Kind: "scene", Label: "街边", Prompt: "街边空景", Required: true}}
	payload["actualReferences"] = []map[string]any{
		{"id": "product_white", "kind": "product", "label": "白色上衣", "url": "https://example.com/white.jpg"},
		{"id": "person", "kind": "person", "label": "家中人物", "url": "https://example.com/person.jpg"},
		{"id": "street", "kind": "scene", "label": "街边", "url": "https://example.com/street.jpg"},
	}
	attachGateway(payload, server.URL)
	rec := postSales(t, Finalize(config.Config{}), "/", payload)
	var response struct {
		FullPrompt string `json:"fullPrompt"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &response) != nil {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if !strings.HasSuffix(response.FullPrompt, full) {
		t.Fatal("finalization changed the scripted cuts, camera or dialogue")
	}
	for _, expected := range []string{"按时间轴指定的机位", "各场景使用自身参考", "不覆盖其他场景", "0–7秒", "7–15秒"} {
		if !strings.Contains(response.FullPrompt, expected) {
			t.Errorf("submitted prompt missing %s", expected)
		}
	}
	for _, forbidden := range []string{"同一机位的时间分段连续拍摄", "日常穿搭分享，固定手机机位", "沿用实际参考图的人物、房间、光向"} {
		if strings.Contains(response.FullPrompt, forbidden) {
			t.Errorf("preamble overrode the scene route: %s", forbidden)
		}
	}
}

func TestFashionVoiceoverPreambleDoesNotForceFace(t *testing.T) {
	text := workflowFinalConstraints(nil, []ScriptShot{{ShotId: 1, Duration: 15, SpeechMode: "voiceover"}}, nil, 15, "9:16")
	if !strings.Contains(text, "画外音段按脚本构图，不强加人脸或画内开口") || strings.Contains(text, "15秒：声音来源：出镜人物") {
		t.Fatal("voiceover preamble forces a speaking face")
	}
}

func TestFashionVideoKeepsColorFidelityWithoutSKUColorName(t *testing.T) {
	for _, color := range []string{"", "粉紫色"} {
		payload := map[string]any{"selectedColor": color}
		text := workflowFinalConstraints(payload, []ScriptShot{{ShotId: 1, Duration: 15, SpeechMode: "voiceover"}}, nil, 15, "9:16")
		for _, expected := range []string{"保留色相、明度、饱和度和冷暖倾向", "中性白平衡", "不随地点与镜头改变颜色"} {
			if !strings.Contains(text, expected) {
				t.Errorf("color %q: final constraints missing %s", color, expected)
			}
		}
		if color != "" && !strings.Contains(text, "不按色名额外加深或增艳") {
			t.Fatal("SKU label can override reference appearance")
		}
	}
}

func TestFashionFinalizeRejectsUnresolvedExampleReferences(t *testing.T) {
	for _, placeholder := range []string{"{{Mixed 1}}", "{{ Mixed 14 }}", "<node-asset>4189427858700</node-asset>"} {
		for _, segmentOnly := range []bool{false, true} {
			full, segment := "图片1已绑定", "图片2已绑定"
			if segmentOnly {
				segment += placeholder
			} else {
				full += placeholder
			}
			if err := validateFinalImageNumbers(full, []finalPrompt{{ShotID: 1, SpeechMode: "voiceover", Prompt: segment}}, 2); err == nil || !strings.Contains(err.Error(), "未绑定") {
				t.Fatalf("unresolved reference was accepted: %s", placeholder)
			}
		}
	}
	if err := validateFinalImageNumbers("图片1继承身份，图片2负责街边", []finalPrompt{{ShotID: 1, SpeechMode: "voiceover", Prompt: "参考图2街边"}}, 2); err != nil {
		t.Fatal(err)
	}
}
