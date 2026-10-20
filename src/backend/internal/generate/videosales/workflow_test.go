package videosales

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

func workflowPayload() map[string]any {
	return map[string]any{
		"workflowVersion": 3, "targetDuration": 15, "aspectRatio": "16:9", "productName": "白色纸巾", "category": "home", "selectedColor": "白色",
		"imageCatalog":         []map[string]any{{"index": 2, "url": "https://example.com/white.jpg", "role": "main"}, {"index": 9, "url": "https://example.com/red.jpg", "role": "sku"}},
		"eligibleImageIndexes": []int{2},
		"shots":                []map[string]any{{"shotId": 1, "imageIndex": 2, "duration": 15, "description": "桌面纸巾展示", "camera": "推近", "voiceover": "看看这款纸巾", "prompt": "展示商品", "visualSource": "ai_generate"}},
		"actualReferences":     []map[string]any{{"id": "product_white", "kind": "product", "label": "白色纸巾", "url": "https://example.com/white.jpg"}, {"id": "table", "kind": "scene", "label": "桌面场景", "url": "https://example.com/table.jpg"}},
	}
}

func validWorkflowScript() string {
	return `{"scripts":[{"id":"script_1","title":"桌面展示","deliveryMode":"single","totalDuration":15,"shots":[{"shotId":1,"duration":15,"description":"桌面纸巾","camera":"推近","voiceover":"看看纸巾","prompt":"展示商品","visualSource":"ai_generate"}],"assets":[{"id":"table","kind":"scene","label":"桌面","prompt":"实拍桌面纸巾，商品保持白色","required":true,"usesProduct":true}]}]}`
}

func attachGateway(payload map[string]any, url string) {
	payload["customBaseUrl"] = url
	payload["customApiKey"] = "test"
}

func TestWorkflowScriptHasPlanWithoutPersonOrVideoModel(t *testing.T) {
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		if body["max_tokens"] != float64(longOutputTokens) {
			t.Errorf("max_tokens %#v", body["max_tokens"])
		}
		for _, expected := range []string{"deliveryMode", "referenceAssetIds", "usesProduct", "精确等于", "16:9", "selectedColor", "white.jpg"} {
			if !strings.Contains(text, expected) {
				t.Errorf("missing %s", expected)
			}
		}
		for _, forbidden := range []string{"red.jpg", "开箱换装", "没有提供出镜人物"} {
			if strings.Contains(text, forbidden) {
				t.Errorf("unexpected %s", forbidden)
			}
		}
		return validWorkflowScript()
	})
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	rec := postSales(t, Script(config.Config{}), "/script", payload)
	if rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"deliveryMode":"single"`) || !strings.Contains(rec.Body.String(), `"assets"`) {
		t.Fatal(rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "imageIndex") {
		t.Fatal("unselected imageIndex should not be invented")
	}
}

func TestWorkflowScriptRejectsInvalidTimingAndAssetPlan(t *testing.T) {
	cases := []struct{ name, reply string }{
		{"wrong sum", strings.Replace(validWorkflowScript(), `"duration":15`, `"duration":14`, 1)},
		{"wrong total", strings.Replace(validWorkflowScript(), `"totalDuration":15`, `"totalDuration":14`, 1)},
		{"zero duration", strings.Replace(validWorkflowScript(), `"duration":15`, `"duration":0`, 1)},
		{"wrong mode", strings.Replace(validWorkflowScript(), `"single"`, `"clips"`, 1)},
		{"unknown image", strings.Replace(validWorkflowScript(), `"shotId":1`, `"shotId":1,"imageIndex":9`, 1)},
		{"missing required", strings.Replace(validWorkflowScript(), `"required":true,`, "", 1)},
		{"unknown kind", strings.Replace(validWorkflowScript(), `"kind":"scene"`, `"kind":"unknown"`, 1)},
		{"self dependency", strings.Replace(validWorkflowScript(), `"usesProduct":true`, `"usesProduct":true,"referenceAssetIds":["table"]`, 1)},
		{"bad JSON", `{"scripts":`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := useChatServer(t, func(map[string]any, int) string { return tc.reply })
			payload := workflowPayload()
			payload["allowFallback"] = true
			attachGateway(payload, server.URL)
			rec := postSales(t, Script(config.Config{}), "/script", payload)
			if rec.Code != 502 {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowRejectsMalformedCatalogAcrossHandlers(t *testing.T) {
	handlers := []struct {
		name    string
		handler http.Handler
	}{{"analyze", Analyze(config.Config{})}, {"script", Script(config.Config{})}, {"select", Select(config.Config{})}, {"finalize", Finalize(config.Config{})}}
	cases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"missing allowlist", func(p map[string]any) { delete(p, "eligibleImageIndexes") }},
		{"unknown allowed ID", func(p map[string]any) { p["eligibleImageIndexes"] = []int{44} }},
		{"fractional ID", func(p map[string]any) { p["eligibleImageIndexes"] = []float64{2.1} }},
		{"null allowed ID", func(p map[string]any) {
			p["imageCatalog"] = []map[string]any{{"index": 0, "url": "a", "role": "main"}}
			p["eligibleImageIndexes"] = []any{nil}
		}},
		{"duplicate allowed ID", func(p map[string]any) { p["eligibleImageIndexes"] = []int{2, 2} }},
		{"duplicate catalog ID", func(p map[string]any) {
			p["imageCatalog"] = []map[string]any{{"index": 2, "url": "a", "role": "main"}, {"index": 2, "url": "b", "role": "main"}}
		}},
		{"missing catalog index", func(p map[string]any) {
			p["imageCatalog"] = []map[string]any{{"url": "a", "role": "main"}}
			p["eligibleImageIndexes"] = []int{0}
		}},
		{"unknown version", func(p map[string]any) { p["workflowVersion"] = 4 }},
	}
	for _, handler := range handlers {
		for _, tc := range cases {
			t.Run(handler.name+"/"+tc.name, func(t *testing.T) {
				payload := workflowPayload()
				payload["operation"] = "finalize"
				tc.mutate(payload)
				rec := postSales(t, handler.handler, "/", payload)
				if rec.Code != 400 {
					t.Fatalf("got %d %s", rec.Code, rec.Body.String())
				}
			})
		}
	}
}

func TestWorkflowAnalysisOnlySeesEligiblePictures(t *testing.T) {
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		if strings.Contains(text, "red.jpg") {
			t.Error("disallowed picture sent to model")
		}
		if strings.Contains(text, "开箱换装") {
			t.Error("home analysis used the fashion narrative")
		}
		return `{"productName":"纸巾","sellingPoints":["白色包装"]}`
	})
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	rec := postSales(t, Analyze(config.Config{}), "/", payload)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"coveredImageCount":1`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowSelectRejectsUnseenCatalogPicture(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"assignments":[{"shotId":1,"imageIndex":8,"reason":"未查看"}]}`
	})
	payload := workflowPayload()
	catalog := []map[string]any{}
	allowed := []int{}
	for i := 0; i < 9; i++ {
		catalog = append(catalog, map[string]any{"index": i, "url": fmt.Sprintf("https://example.com/%d.jpg", i), "role": "main"})
		allowed = append(allowed, i)
	}
	payload["imageCatalog"] = catalog
	payload["eligibleImageIndexes"] = allowed
	attachGateway(payload, server.URL)
	rec := postSales(t, Select(config.Config{}), "/", payload)
	if rec.Code != 502 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowAnalysisAppliesFashionNarrative(t *testing.T) {
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		for _, expected := range []string{"开箱换装", "生活穿搭", "鞋包展示", "creativeNotes", "videoSuggestions", "productName", "sellingPoints"} {
			if !strings.Contains(text, expected) {
				t.Errorf("missing %s", expected)
			}
		}
		return `{"productName":"卫衣","sellingPoints":["黑色圆领"]}`
	})
	payload := workflowPayload()
	payload["category"] = "fashion"
	payload["productName"] = "黑色卫衣"
	attachGateway(payload, server.URL)
	rec := postSales(t, Analyze(config.Config{}), "/", payload)
	if rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowFashionScriptRequestsNarrative(t *testing.T) {
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		for _, expected := range []string{"开箱换装", "生活穿搭", "鞋包展示", "beat", "deliveryMode", "usesProduct"} {
			if !strings.Contains(text, expected) {
				t.Errorf("missing %s", expected)
			}
		}
		return validWorkflowScript()
	})
	payload := workflowPayload()
	payload["category"] = "fashion"
	payload["productName"] = "黑色卫衣"
	attachGateway(payload, server.URL)
	rec := postSales(t, Script(config.Config{}), "/", payload)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"beat":"unbox"`) || !strings.Contains(rec.Body.String(), `"deliveryMode":"single"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowFashionWearingAssetMustUseProduct(t *testing.T) {
	reply := strings.Replace(validWorkflowScript(), "桌面纸巾，商品保持白色", "衣服上身实拍", 1)
	reply = strings.Replace(reply, `"usesProduct":true`, `"usesProduct":false`, 1)
	server := useChatServer(t, func(map[string]any, int) string { return reply })
	payload := workflowPayload()
	payload["category"] = "fashion"
	attachGateway(payload, server.URL)
	rec := postSales(t, Script(config.Config{}), "/", payload)
	if rec.Code != 502 || !strings.Contains(rec.Body.String(), "usesProduct") {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestAssetPlanDependenciesAreOrdered(t *testing.T) {
	assets := []PlannedAsset{{ID: "person", Kind: "person", Label: "人物", Prompt: "实拍人物", Required: true}, {ID: "face", Kind: "face", Label: "人脸", Prompt: "人脸", Required: true, ReferenceAssetIDs: []string{"person"}}}
	if err := validateAssetPlan(assets); err != nil {
		t.Fatal(err)
	}
	assets[0].ReferenceAssetIDs = []string{"face"}
	if err := validateAssetPlan(assets); err == nil {
		t.Fatal("accepted cycle")
	}
}

func TestWorkflowScriptAndSelectExposeCallFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"message":"secret-token"}}`)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { generate.ModelHTTP = previous }()
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	script := postSales(t, Script(config.Config{}), "/script", payload)
	if script.Code != 502 || !strings.Contains(script.Body.String(), "脚本模型调用失败：鉴权失败") || strings.Contains(script.Body.String(), "secret-token") {
		t.Fatalf("script %d %s", script.Code, script.Body.String())
	}
	selection := postSales(t, Select(config.Config{}), "/select", payload)
	if selection.Code != 502 || !strings.Contains(selection.Body.String(), "选图模型调用失败：鉴权失败") || strings.Contains(selection.Body.String(), "secret-token") {
		t.Fatalf("select %d %s", selection.Code, selection.Body.String())
	}
}

func TestLongOutputBudgetStaysOnScriptAndFinalize(t *testing.T) {
	script := scriptChatBody("claude-haiku-5-5", map[string]any{}, "纸巾", "home", "product_closeup", "", "")
	shots := []ScriptShot{{ShotId: 1, Duration: 15, Description: "展示", Voiceover: "看", Prompt: "展示", VisualSource: "product_image"}}
	bodies := []map[string]any{
		script,
		finalizeChatBody("m", shots, nil, ""),
		fashionFinalizeBody("m", shots, []fashionRef{{Label: "商品", URL: "https://example.com/a.jpg"}}, ""),
	}
	for _, body := range bodies {
		if body["max_tokens"] != longOutputTokens {
			t.Fatalf("%#v", body["max_tokens"])
		}
	}
	if _, ok := chatBody("m", "sys", "user", 0.2)["max_tokens"]; ok {
		t.Fatal("analysis should keep the gateway default output limit")
	}
	if _, ok := selectChatBody("m", shots, nil)["max_tokens"]; ok {
		t.Fatal("select should keep the gateway default output limit")
	}
}

func TestWorkflowTruncatedOutputIsNotParsedAsJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		encoded, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{
			"finish_reason": "length",
			"message":       map[string]string{"content": `{"scripts":[`},
		}}})
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	defer func() { generate.ModelHTTP = previous }()
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	script := postSales(t, Script(config.Config{}), "/script", payload)
	if script.Code != 502 || !strings.Contains(script.Body.String(), errTruncatedOutput.Error()) || strings.Contains(script.Body.String(), "有效脚本 JSON") {
		t.Fatalf("script %d %s", script.Code, script.Body.String())
	}
	legacy := map[string]any{"productName": "纸巾", "category": "home", "allowFallback": true, "customBaseUrl": server.URL, "customApiKey": "test"}
	legacyRec := postSales(t, Script(config.Config{}), "/script", legacy)
	if legacyRec.Code != 502 || !strings.Contains(legacyRec.Body.String(), errTruncatedOutput.Error()) || strings.Contains(legacyRec.Body.String(), `"success":true`) {
		t.Fatalf("legacy %d %s", legacyRec.Code, legacyRec.Body.String())
	}
	payload["operation"] = "finalize"
	final := postSales(t, Finalize(config.Config{}), "/finalize", payload)
	if final.Code != 502 || !strings.Contains(final.Body.String(), errTruncatedOutput.Error()) || strings.Contains(final.Body.String(), "JSON 无效") || strings.Contains(final.Body.String(), "视觉模型调用失败") {
		t.Fatalf("finalize %d %s", final.Code, final.Body.String())
	}
}

func TestWorkflowSelectRejectsUnusableAssignments(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string { return `{"assignments":[]}` })
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	rec := postSales(t, Select(config.Config{}), "/select", payload)
	if rec.Code != 502 || !strings.Contains(rec.Body.String(), "选图结果无效") || strings.Contains(rec.Body.String(), "请检查模型与密钥") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}
