package videosales

import (
	"encoding/json"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestWorkflowAssetProductReferencesPreserveViewIndexes(t *testing.T) {
	reply := strings.Replace(validWorkflowScript(), `"usesProduct":true`, `"usesProduct":true,"productImageIndexes":[2]`, 1)
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		for _, expected := range []string{"productImageIndexes", "目标视角", "正面、背面", "未知细节不编造"} {
			if !strings.Contains(string(encoded), expected) {
				t.Errorf("missing %s", expected)
			}
		}
		return reply
	})
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	rec := postSales(t, Script(config.Config{}), "/script", payload)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"productImageIndexes":[2]`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowResponsePreservesExplicitNonProductAsset(t *testing.T) {
	script := SalesScript{Assets: []PlannedAsset{{ID: "person", Kind: "person", Label: "成年人物肖像", Prompt: "只拍面部", Required: true, UsesProduct: false}}}
	response := workflowScriptResponse(script)
	assets := response["assets"].([]any)
	asset := assets[0].(map[string]any)
	if uses, exists := asset["usesProduct"]; !exists || uses != false {
		t.Fatalf("explicit false lost during serialization: %#v", asset)
	}
}

func TestWorkflowRejectsInvalidAssetProductReferences(t *testing.T) {
	for _, indexes := range []string{`[9]`, `[77]`, `[2,2]`, `[-1]`, `[2.5]`, `[]`} {
		t.Run(indexes, func(t *testing.T) {
			reply := strings.Replace(validWorkflowScript(), `"usesProduct":true`, `"usesProduct":true,"productImageIndexes":`+indexes, 1)
			server := useChatServer(t, func(map[string]any, int) string { return reply })
			payload := workflowPayload()
			attachGateway(payload, server.URL)
			rec := postSales(t, Script(config.Config{}), "/script", payload)
			if rec.Code != 502 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowValidationChecksAssetViewInsteadOfColorOnly(t *testing.T) {
	refs := []actualReference{{ID: "front", Kind: "keyframe", Label: "卫衣正面", URL: "front.jpg"}}
	body := validationBody("vision", map[string]any{"assets": []PlannedAsset{{ID: "front", ProductImageIndexes: []int{2}}}}, nil, refs, nil)
	encoded, _ := json.Marshal(body)
	for _, expected := range []string{"领口前后高低", "名称或提示词写正面但实际是背面时必须 conflict", "无法确认正反或必要外观一致性时 uncertain", "标志在正常比例下较小不等于缺失或移位", "不得因为黑色", "productImageIndexes"} {
		if !strings.Contains(string(encoded), expected) {
			t.Errorf("missing %s", expected)
		}
	}
	results, err := parseValidations(`{"validations":[{"id":"front","status":"conflict","reason":"要求胸前正面，实际为高领口无标志的背面"}]}`, refs)
	if err != nil || results[0].Status != "conflict" {
		t.Fatalf("view conflict lost: %#v %v", results, err)
	}
}
