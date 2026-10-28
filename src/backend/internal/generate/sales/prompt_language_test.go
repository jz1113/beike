package sales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSalesDirectingUsesChineseAndPreservesConfirmedDialogue(t *testing.T) {
	shots := []ScriptShot{{ShotId: 1, SpeechMode: "on_camera", Voiceover: "这件有 logo，看这里。"}}
	text := chineseSalesDirecting("on_camera段展示SKU，生活VLOG，保持logo；台词：这件有 logo，看这里。", shots)
	if text != "出镜说话段展示商品规格，生活生活记录，保持标志；台词：这件有 logo，看这里。" {
		t.Fatal(text)
	}
	if err := validateChineseSalesDirecting(text, nil, shots); err != nil {
		t.Fatal(err)
	}
	if err := validateChineseSalesDirecting("camera direction", nil, shots); err == nil {
		t.Fatal("accepted English directing")
	}
	if err := validateChineseSalesDirecting(text, []finalPrompt{{Prompt: "voiceover unknown words"}}, shots); err == nil {
		t.Fatal("did not validate segment text")
	}
}

func TestSalesDirectingNormalizesRenderTechnicalTerms(t *testing.T) {
	result := chineseSalesDirectingWithReport("480P 输出由 FFmpeg 处理，时间线 30fps。", nil)
	if strings.Contains(result.Text, "480P") || strings.Contains(result.Text, "FFmpeg") || strings.Contains(result.Text, "30fps") {
		t.Fatalf("technical terms were not normalized: %s", result.Text)
	}
	if len(result.Converted) != 3 {
		t.Fatalf("expected three conversion warnings, got %#v", result.Converted)
	}
}

func TestSalesDirectingAllowsBrandOutsideConfirmedDialogue(t *testing.T) {
	text := chineseSalesDirecting("画面保持 Nike 运动鞋的标志与结构。", nil)
	if err := validateChineseSalesDirectingWithAllowlist(text, nil, nil, []string{"Nike"}); err != nil {
		t.Fatal(err)
	}
	if err := validateChineseSalesDirectingWithAllowlist(text, nil, nil, []string{"Adidas"}); err == nil {
		t.Fatal("accepted an unallowlisted English brand")
	}
}

func TestSalesFinalizationReturnsChinesePromptWithProtocolEnums(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"fullPrompt":"【拍摄】on_camera和voiceover按脚本执行，SKU和logo保持一致。看看这款纸巾","prompts":[{"shotId":1,"speechMode":"voiceover","prompt":"voiceover画外音，看看这款纸巾"}]}`
	})
	payload := workflowPayload()
	payload["operation"] = "finalize"
	attachGateway(payload, server.URL)
	rec := postSales(t, Finalize(config.Config{}), "/", payload)
	var result struct {
		FullPrompt string        `json:"fullPrompt"`
		Prompts    []finalPrompt `json:"prompts"`
	}
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &result) != nil {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if salesPromptEnglishWord.MatchString(result.FullPrompt) || salesPromptEnglishWord.MatchString(result.Prompts[0].Prompt) {
		t.Fatal("English leaked into prompt")
	}
	if result.Prompts[0].SpeechMode != "voiceover" || !strings.Contains(result.FullPrompt, "【图片参考职责】") {
		t.Fatal("lost protocol or structure")
	}
}
