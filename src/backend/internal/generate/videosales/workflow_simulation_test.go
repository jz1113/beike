package videosales

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

func guardLocalModelHTTP(t *testing.T, server *httptest.Server) {
	t.Helper()
	current := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client {
		client := current()
		base := client.Transport
		if base == nil {
			base = http.DefaultTransport
		}
		client.Transport = roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.Hostname() != "127.0.0.1" {
				t.Errorf("blocked non-local request %s", req.URL.Hostname())
				return nil, fmt.Errorf("blocked non-local model request")
			}
			return base.RoundTrip(req)
		})
		return client
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) { return fn(req) }

func TestWorkflowSimulatesFashionPipelineWithoutPaidModels(t *testing.T) {
	const fashionScript = `{"scripts":[{"title":"开箱展示","beat":"unbox","deliveryMode":"single","totalDuration":15,"shots":[{"shotId":1,"duration":15,"description":"展示黑色上衣","camera":"中景","voiceover":"降温还在找一件不闷的圆领，这件黑色纯棉套上就能出门。领口贴着锁骨，近看是平纹，走远了颜色还是这一块黑。单穿就能出门，里面加件衬衫也压得住，上班和周末都不用再换一件外套。","prompt":"展示商品","visualSource":"product_image"}],"assets":[{"id":"person","kind":"person","label":"出镜人物","prompt":"成年人物上身展示黑色上衣","required":true,"usesProduct":true},{"id":"face","kind":"face","label":"人物特写","prompt":"同一人物面部特写","required":true,"referenceAssetIds":["person"]}]}]}`
	replies := []string{
		`{"productName":"黑色圆领上衣","category":"fashion","sellingPoints":["圆领"],"knownFacts":["黑色"],"creativeNotes":["开箱换装"]}`,
		fashionScript,
		`{"assignments":[{"shotId":1,"imageIndex":7,"reason":"黑色主图"}]}`,
		`{"validations":[{"id":"product-7","status":"passed","reason":"黑色与原图一致"},{"id":"person","status":"passed","reason":"人物已生成"},{"id":"face","status":"passed","reason":"与人物一致"}]}`,
		`{"fullPrompt":"图片1黑色上衣，图片2人物，图片3特写","prompts":[{"shotId":1,"prompt":"0到15秒展示黑色上衣"}]}`,
	}
	var calls int
	server := useChatServer(t, func(body map[string]any, call int) string {
		calls = call
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		if strings.Contains(text, "white.jpg") {
			t.Errorf("call %d sent a disallowed image", call)
		}
		if call == 1 && !strings.Contains(text, "本次确认颜色：黑色") {
			t.Errorf("analysis omitted the selected color: %s", text)
		}
		if call == 2 && !strings.Contains(text, "开箱换装") {
			t.Error("fashion script omitted its narrative")
		}
		if call == 5 && (!strings.Contains(text, "图片1") || !strings.Contains(text, "图片3") || !strings.Contains(text, "黑色")) {
			t.Error("finalize omitted the actual reference order or color")
		}
		return replies[call-1]
	})
	guardLocalModelHTTP(t, server)
	payload := map[string]any{
		"workflowVersion": 3, "targetDuration": 15, "aspectRatio": "9:16", "productName": "黑色圆领上衣", "category": "fashion", "selectedColor": "黑色",
		"imageCatalog":         []map[string]any{{"index": 7, "url": "https://example.com/black.jpg", "role": "main"}, {"index": 8, "url": "https://example.com/white.jpg", "role": "sku"}},
		"eligibleImageIndexes": []int{7},
	}
	attachGateway(payload, server.URL)
	analysis := postSales(t, Analyze(config.Config{}), "/analyze", payload)
	if analysis.Code != 200 || !strings.Contains(analysis.Body.String(), "圆领") {
		t.Fatalf("analyze %d %s", analysis.Code, analysis.Body.String())
	}
	payload["productAnalysis"] = analysis.Body.String()
	script := postSales(t, Script(config.Config{}), "/script", payload)
	if script.Code != 200 || !strings.Contains(script.Body.String(), `"beat":"unbox"`) {
		t.Fatalf("script %d %s", script.Code, script.Body.String())
	}
	var parsed struct {
		Scripts []map[string]any `json:"scripts"`
	}
	if json.Unmarshal(script.Body.Bytes(), &parsed) != nil || len(parsed.Scripts) != 1 {
		t.Fatal(script.Body.String())
	}
	payload["shots"] = parsed.Scripts[0]["shots"]
	payload["assets"] = parsed.Scripts[0]["assets"]
	selected := postSales(t, Select(config.Config{}), "/select", payload)
	if selected.Code != 200 || !strings.Contains(selected.Body.String(), `"imageIndex":7`) {
		t.Fatalf("select %d %s", selected.Code, selected.Body.String())
	}
	shots, _ := payload["shots"].([]any)
	shots[0].(map[string]any)["imageIndex"] = 7
	payload["actualReferences"] = []map[string]any{
		{"id": "product-7", "kind": "product", "label": "商品参考", "url": "https://example.com/black.jpg"},
		{"id": "person", "kind": "person", "label": "出镜人物", "url": "https://example.com/person.jpg"},
		{"id": "face", "kind": "face", "label": "人物特写", "url": "https://example.com/face.jpg"},
	}
	payload["operation"] = "validate-assets"
	validation := postSales(t, Finalize(config.Config{}), "/validate", payload)
	if validation.Code != 200 || strings.Contains(validation.Body.String(), `"status":"conflict"`) {
		t.Fatalf("validate %d %s", validation.Code, validation.Body.String())
	}
	payload["operation"] = "finalize"
	payload["videoModel"] = "kling-video-v3-omni"
	final := postSales(t, Finalize(config.Config{}), "/finalize", payload)
	if final.Code != 200 || !strings.Contains(final.Body.String(), "商品颜色事实：黑色") || strings.Contains(final.Body.String(), "white.jpg") {
		t.Fatalf("finalize %d %s", final.Code, final.Body.String())
	}
	if calls != 5 {
		t.Fatalf("expected 5 model calls, got %d", calls)
	}
}

func TestWorkflowGenericScriptOmitsFashionNarrative(t *testing.T) {
	server := useChatServer(t, func(body map[string]any, call int) string {
		encoded, _ := json.Marshal(body)
		if strings.Contains(string(encoded), "开箱换装") {
			t.Errorf("call %d used the fashion narrative", call)
		}
		if call == 1 {
			return `{"productName":"纸巾","category":"home","sellingPoints":["白色包装"]}`
		}
		return `{"scripts":[{"title":"桌面展示","deliveryMode":"single","totalDuration":15,"shots":[{"shotId":1,"duration":15,"description":"展示纸巾","camera":"推近","voiceover":"看看纸巾","prompt":"展示商品"}],"assets":[{"id":"scene","kind":"scene","label":"桌面","prompt":"实拍桌面","required":true}]}]}`
	})
	guardLocalModelHTTP(t, server)
	payload := workflowPayload()
	attachGateway(payload, server.URL)
	analysis := postSales(t, Analyze(config.Config{}), "/analyze", payload)
	if analysis.Code != 200 {
		t.Fatalf("analyze %d %s", analysis.Code, analysis.Body.String())
	}
	payload["productAnalysis"] = analysis.Body.String()
	script := postSales(t, Script(config.Config{}), "/script", payload)
	if script.Code != 200 || strings.Contains(script.Body.String(), "unbox") || !strings.Contains(script.Body.String(), `"kind":"scene"`) {
		t.Fatalf("script %d %s", script.Code, script.Body.String())
	}
}

func TestWorkflowScriptRejectsFortyFirstShot(t *testing.T) {
	for _, count := range []int{40, 41} {
		t.Run(fmt.Sprintf("%d", count), func(t *testing.T) {
			server := useChatServer(t, func(map[string]any, int) string { return scriptWithShots(count) })
			payload := workflowPayload()
			payload["targetDuration"] = count
			attachGateway(payload, server.URL)
			rec := postSales(t, Script(config.Config{}), "/script", payload)
			if count == 40 && rec.Code != 200 {
				t.Fatalf("40 shots should pass, got %d %s", rec.Code, rec.Body.String())
			}
			if count == 41 && (rec.Code != 502 || !strings.Contains(rec.Body.String(), "分镜数量不能超过40")) {
				t.Fatalf("41 shots should fail, got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func scriptWithShots(count int) string {
	shots := make([]map[string]any, count)
	for i := 0; i < count; i++ {
		shots[i] = map[string]any{"shotId": i + 1, "duration": 1, "description": "展示商品", "camera": "中景", "voiceover": "看", "prompt": "展示商品", "visualSource": "product_image"}
	}
	encoded, _ := json.Marshal(map[string]any{"scripts": []any{map[string]any{
		"title": "多镜", "deliveryMode": "single", "totalDuration": count, "shots": shots,
		"assets": []any{map[string]any{"id": "scene", "kind": "scene", "label": "桌面", "prompt": "实拍桌面", "required": true}},
	}}})
	return string(encoded)
}

func TestWorkflowFinalizeKeepsSafeFailureReasons(t *testing.T) {
	secret := "sk-test-secret https://cdn.example/private.png?token=abc"
	cases := []struct {
		status int
		want   string
	}{
		{401, "鉴权失败"},
		{429, "触发限流"},
		{503, "服务暂不可用（HTTP 503）"},
		{504, "不要立刻再次提交"},
	}
	for _, operation := range []string{"validate-assets", "finalize"} {
		for _, tc := range cases {
			t.Run(fmt.Sprintf("%s/%d", operation, tc.status), func(t *testing.T) {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(tc.status)
					_, _ = w.Write([]byte(`{"error":{"message":"` + secret + `"}}`))
				}))
				defer server.Close()
				previous := generate.ModelHTTP
				generate.ModelHTTP = func() *http.Client { return server.Client() }
				defer func() { generate.ModelHTTP = previous }()
				payload := workflowPayload()
				payload["operation"] = operation
				attachGateway(payload, server.URL)
				rec := postSales(t, Finalize(config.Config{}), "/finalize", payload)
				body := rec.Body.String()
				label := "素材校验失败"
				if operation == "finalize" {
					label = "视频定稿失败"
				}
				if rec.Code != 502 || !strings.Contains(body, tc.want) || !strings.Contains(body, label) || strings.Contains(body, "sk-test-secret") || strings.Contains(body, "token=abc") {
					t.Fatalf("%d %s", rec.Code, body)
				}
			})
		}
	}
}
