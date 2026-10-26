package sales

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
			reply := strings.Replace(validWorkflowScript(), `"productImageIndexes":[2]`, `"productImageIndexes":`+indexes, 1)
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
