package sales

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

func TestWorkflowScriptAcceptsHarmlessMetadataDifferences(t *testing.T) {
	cases := []struct{ name, replacement string }{
		{"empty dependencies", `"referenceAssetIds":"","usesProduct":true`},
		{"null dependencies", `"referenceAssetIds":null,"usesProduct":true`},
		{"unused overlay", `"usesProduct":true`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			reply := strings.Replace(validWorkflowScript(), `"usesProduct":true`, tc.replacement, 1)
			if tc.name == "unused overlay" {
				reply = strings.Replace(reply, `"shotId":1`, `"shotId":1,"textOverlay":{"enabled":false,"lines":[]}`, 1)
			}
			server := useChatServer(t, func(map[string]any, int) string { return reply })
			payload := workflowPayload()
			attachGateway(payload, server.URL)
			rec := postSales(t, Script(config.Config{}), "/script", payload)
			if rec.Code != 200 {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "textOverlay") {
				t.Fatal("unused overlays must not appear in subtitle-free scripts")
			}
		})
	}
}

func TestWorkflowScriptParseExplainsFailuresWithoutModelContent(t *testing.T) {
	cases := []struct{ name, reply, expected string }{
		{"syntax", `{"scripts":`, "JSON 不完整或语法错误"},
		{"missing scripts", `{"private":"secret-model-output"}`, "缺少 scripts"},
		{"multiple scripts", `{"scripts":[{},{}]}`, "返回了 2 套脚本"},
		{"shot type", strings.Replace(validWorkflowScript(), `"camera":"推近"`, `"camera":{"private":"secret-model-output"}`, 1), "scripts.shots.camera"},
		{"dependency type", strings.Replace(validWorkflowScript(), `"usesProduct":true`, `"referenceAssetIds":[42],"usesProduct":true`, 1), "scripts.assets.referenceAssetIds"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := useChatServer(t, func(map[string]any, int) string { return tc.reply })
			payload := workflowPayload()
			attachGateway(payload, server.URL)
			rec := postSales(t, Script(config.Config{}), "/script", payload)
			if rec.Code != 502 || !strings.Contains(rec.Body.String(), tc.expected) || strings.Contains(rec.Body.String(), "secret-model-output") {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowScriptClaudeNativeResponseParsing(t *testing.T) {
	for _, invalid := range []bool{false, true} {
		t.Run(map[bool]string{false: "usable JSON", true: "field mismatch"}[invalid], func(t *testing.T) {
			calls := 0
			reply := strings.Replace(validWorkflowScript(), `"usesProduct":true`, `"referenceAssetIds":"","usesProduct":true`, 1)
			reply = strings.Replace(reply, `"shotId":1`, `"shotId":1,"textOverlay":{"enabled":false}`, 1)
			if invalid {
				reply = strings.Replace(reply, `"camera":"推近"`, `"camera":{"private":"secret-model-output"}`, 1)
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.URL.Path != "/v1/messages" {
					t.Errorf("unexpected native route %s", r.URL.Path)
				}
				_, _ = w.Write([]byte(anthropicText("```json\n" + reply + "\n```")))
			}))
			defer server.Close()
			previous := generate.ModelHTTP
			generate.ModelHTTP = func() *http.Client { return server.Client() }
			defer func() { generate.ModelHTTP = previous }()
			payload := workflowPayload()
			payload["model"] = "claude-haiku-5-5"
			payload["textProtocol"] = "anthropic"
			payload["imageCatalog"] = salesImages(1)
			payload["eligibleImageIndexes"] = []int{1}
			attachGateway(payload, server.URL)
			body, _ := json.Marshal(payload)
			rec := httptest.NewRecorder()
			Script(config.Config{}).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/script", bytes.NewReader(body)))
			want := 200
			if invalid {
				want = 502
				if !strings.Contains(rec.Body.String(), "scripts.shots.camera") {
					t.Fatal(rec.Body.String())
				}
			}
			if rec.Code != want || calls != 1 || strings.Contains(rec.Body.String(), "secret-model-output") {
				t.Fatalf("calls=%d status=%d body=%s", calls, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestWorkflowScriptPromptUsesCompleteCurrentExample(t *testing.T) {
	for _, category := range []string{"home", "fashion"} {
		payload := workflowPayload()
		payload["category"] = category
		body := workflowScriptBody("m", payload, nil, 30, "16:9")
		messages := body["messages"].([]map[string]any)
		prompt := messages[0]["content"].(string)
		start := strings.Index(prompt, `{"scripts":`)
		if start < 0 {
			t.Fatal("missing complete workflow JSON example")
		}
		var example map[string]any
		if err := json.NewDecoder(strings.NewReader(prompt[start:])).Decode(&example); err != nil {
			t.Fatal(err)
		}
		raw, _ := json.Marshal(example)
		script, normalized, err := oneSalesScript(string(raw))
		if err != nil {
			t.Fatal(err)
		}
		if script.DeliveryMode != "single" || script.TotalDuration != 30 || exactDuration(script.Shots, 30) != nil || !scriptReady(script) {
			t.Fatalf("outdated workflow example: %s", raw)
		}
		if err := validateScriptReferences(normalized, nil); err != nil {
			t.Fatal(err)
		}
		if err := validateAssetPlan(script.Assets); err != nil {
			t.Fatal(err)
		}
		if category == "fashion" && script.Beat == "" {
			t.Fatal("fashion example omitted beat")
		}
	}
}
