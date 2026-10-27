package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
)

func TestSalesJSONExtractsOneCompleteObject(t *testing.T) {
	for _, text := range []string{
		"\ufeff{\"ok\":true}", "```JSON\n{\"ok\":true}\n```", "以下是结果：\n{\"ok\":true}\n已完成。",
		`{"ok":true,"lines":["保持,]与,}原文",],}`, `说明{不是数据}，{"ok":true,"text":"保留{衣服}和\\\"引号"}结束。`,
	} {
		raw, ok := scriptJSONObject(text)
		if !ok || !json.Valid(raw) || !strings.Contains(string(raw), `"ok":true`) {
			t.Fatalf("failed to extract %q: %s", text, raw)
		}
		if strings.Contains(text, "保持,]") && !strings.Contains(string(raw), "保持,]与,}原文") {
			t.Fatal("altered quoted content")
		}
	}
	for _, text := range []string{`{"ok":`, `{"ok":true} {"other":true}`, `{"outer":{"ok":true}`, `{"text":"broken"quote"}`} {
		if raw, ok := scriptJSONObject(text); ok {
			t.Fatalf("accepted incomplete/ambiguous JSON: %s", raw)
		}
	}
}

func TestSalesJSONNormalizesCompletedOutputAcrossProtocols(t *testing.T) {
	for _, protocol := range []string{"openai", "anthropic", "gemini"} {
		for _, text := range []string{"结果：\n```JSON\n{\"ok\":true}\n```", `{"ok":true,"list":[1,],}`} {
			t.Run(protocol+text, func(t *testing.T) {
				calls := 0
				server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) { calls++; recoveryReply(w, protocol, text, false) })
				ctx := gateway.WithTextProtocol(context.Background(), protocol)
				content, raw, _, err := postChatJSON(ctx, server.URL, "test", chatBody("m", "JSON", "facts", .2), time.Second)
				if err != nil || calls != 1 || !json.Valid([]byte(content)) || raw["usage"] == nil {
					t.Fatalf("calls=%d content=%s err=%v", calls, content, err)
				}
			})
		}
	}
}

func TestSalesJSONBoundsMalformedOutputRecovery(t *testing.T) {
	for _, protocol := range []string{"openai", "anthropic", "gemini"} {
		for _, recoverable := range []bool{true, false} {
			t.Run(protocol+map[bool]string{true: "/recovered", false: "/failed"}[recoverable], func(t *testing.T) {
				calls := 0
				server := recoveryServer(t, func(w http.ResponseWriter, r *http.Request) {
					calls++
					text := `{"ok":broken}`
					if calls == 2 && recoverable {
						text = `{"ok":true}`
					}
					recoveryReply(w, protocol, text, false)
				})
				ctx := gateway.WithTextProtocol(context.Background(), protocol)
				content, _, _, err := postChatJSON(ctx, server.URL, "test", chatBody("m", "JSON", "facts", .2), time.Second)
				if calls != 2 || (err == nil) != recoverable || (recoverable && content != `{"ok":true}`) {
					t.Fatalf("calls=%d content=%s err=%v", calls, content, err)
				}
			})
		}
	}
}

func TestSalesStagesAcceptWrappedCompletedJSON(t *testing.T) {
	for _, tc := range []struct {
		name, reply string
		handler     http.Handler
	}{
		{"script", validWorkflowScript(), Script(config.Config{})},
		{"analyze", salesAnalysisJSON, Analyze(config.Config{})},
		{"select", `{"assignments":[{"shotId":1,"imageIndex":2,"reason":"主图"}]}`, Select(config.Config{})},
		{"finalize", `{"fullPrompt":"图片1，看看这款纸巾","prompts":[{"shotId":1,"speechMode":"voiceover","prompt":"看看这款纸巾"}]}`, Finalize(config.Config{})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := useChatServer(t, func(map[string]any, int) string { return "已完成：\n```JSON\n" + tc.reply + "\n```\n请查看。" })
			payload := workflowPayload()
			payload["operation"] = "finalize"
			attachGateway(payload, server.URL)
			rec := postSales(t, tc.handler, "/", payload)
			if rec.Code != 200 {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
		})
	}
}
