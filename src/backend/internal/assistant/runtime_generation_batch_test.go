package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func batchClient(t *testing.T, raw string) map[string]any {
	t.Helper()
	var client map[string]any
	if err := json.Unmarshal([]byte(raw), &client); err != nil {
		t.Fatal(err)
	}
	return client
}

const batchClientJSON = `{"generationBatches":[{"sourceId":"draft:a","entries":[{"id":"image:1","title":"首图","mediaType":"image"},{"id":"video:2","title":"短片","mediaType":"video"}]},{"sourceId":"draft:b","entries":[{"id":"image:3","title":"其他来源","mediaType":"image"}]}]}`

func TestGenerateBatchArguments(t *testing.T) {
	invalid := []string{
		`{}`, `{"sourceId":"draft:a"}`, `{"entryIds":["image:1"]}`,
		`{"sourceId":1,"entryIds":["image:1"]}`, `{"sourceId":"draft:a","entryIds":"image:1"}`,
		`{"sourceId":"","entryIds":["image:1"]}`, `{"sourceId":"draft:a","entryIds":[]}`,
		`{"sourceId":"draft:a","entryIds":[1]}`, `{"sourceId":"draft:a","entryIds":[""]}`,
		`{"sourceId":"draft:a","entryIds":["image:1"],"prompt":"任意正文"}`,
	}
	for _, raw := range invalid {
		if _, err := parseToolArguments("trigger_generate_batch", raw); err == nil {
			t.Errorf("accepted invalid arguments %s", raw)
		}
	}
	for _, count := range []int{30, 31} {
		ids := make([]string, count)
		for i := range ids {
			ids[i] = fmt.Sprintf("entry:%d", i)
		}
		raw, _ := json.Marshal(map[string]any{"sourceId": "draft:a", "entryIds": ids})
		_, err := parseToolArguments("trigger_generate_batch", string(raw))
		if (err == nil) != (count == 30) {
			t.Fatalf("count %d: %v", count, err)
		}
	}
}

func TestGenerateBatchReceiptDeduplicatesAndChecksOwnership(t *testing.T) {
	box := &toolBox{ctx: context.Background(), client: batchClient(t, batchClientJSON), allowed: []string{"trigger_generate_batch"}}
	args := map[string]any{"sourceId": "draft:a", "entryIds": []any{"video:2", "image:1", "video:2"}}
	raw := box.run("trigger_generate_batch", args)
	var receipt map[string]any
	if err := json.Unmarshal([]byte(raw), &receipt); err != nil {
		t.Fatal(err)
	}
	ids, _ := receipt["entryIds"].([]any)
	if receipt["success"] != true || receipt["action"] != "generate_batch" || receipt["sourceId"] != "draft:a" || len(ids) != 2 || ids[0] != "video:2" || ids[1] != "image:1" {
		t.Fatalf("receipt %s", raw)
	}
	operation, _ := receipt["operationId"].(string)
	if !strings.HasPrefix(operation, "batch_") || receipt["message"] != "已请求批量提交，客户端将校验后执行" {
		t.Fatalf("receipt wording/operation %s", raw)
	}
	if strings.Contains(box.run("trigger_generate_batch", args), operation) {
		t.Fatal("separate tool calls reused an operation ID")
	}
	for _, request := range []map[string]any{
		{"sourceId": "draft:unknown", "entryIds": []any{"image:1"}},
		{"sourceId": "draft:a", "entryIds": []any{"image:3"}},
		{"sourceId": "draft:a", "entryIds": []any{"image:1", "model-prose-id"}},
		{"sourceId": "draft:a", "entryIds": []any{"image:1", nil}},
	} {
		result := box.run("trigger_generate_batch", request)
		if !toolFailed(result) || clientAction(result) != nil {
			t.Fatalf("invalid ownership produced action %s", result)
		}
	}
	box.client = nil
	if raw := box.run("trigger_generate_batch", args); !toolFailed(raw) || clientAction(raw) != nil {
		t.Fatalf("missing context %s", raw)
	}
}

func TestGenerationBatchContextLimitsAndDuplicates(t *testing.T) {
	invalid := []string{
		`{"generationBatches":null}`, `{"generationBatches":{}}`,
		`{"generationBatches":[{"sourceId":"a","entries":null}]}`,
		`{"generationBatches":[{"sourceId":"a","entries":[]},{"sourceId":"a","entries":[]}]}`,
		`{"generationBatches":[{"sourceId":"a","entries":[{"id":"x","title":"","mediaType":"image"},{"id":"x","title":"","mediaType":"video"}]}]}`,
		`{"generationBatches":[{"sourceId":"a","entries":[{"id":"x","title":"","mediaType":"document"}]}]}`,
		`{"generationBatches":[{"sourceId":"a","entries":[{"id":"x","mediaType":"image"}]}]}`,
		`{"generationBatches":[{"sourceId":" ","entries":[]}]}`,
	}
	for _, raw := range invalid {
		if _, err := generationBatches(batchClient(t, raw)); err == nil {
			t.Errorf("accepted context %s", raw)
		}
	}
	for _, groups := range []int{8, 9} {
		for _, count := range []int{30, 31} {
			batches := []any{}
			for g := 0; g < groups; g++ {
				entries := []any{}
				for i := 0; i < count; i++ {
					entries = append(entries, map[string]any{"id": fmt.Sprint(i), "title": "条目", "mediaType": "image"})
				}
				batches = append(batches, map[string]any{"sourceId": fmt.Sprint(g), "entries": entries})
			}
			_, err := generationBatches(map[string]any{"generationBatches": batches})
			if (err == nil) != (groups == 8 && count == 30) {
				t.Fatalf("groups %d count %d: %v", groups, count, err)
			}
		}
	}
}

func TestGenerateBatchRemainsSequentialAndSkillRestricted(t *testing.T) {
	if isParallelSafe("trigger_generate_batch") || !needsToolApproval("trigger_generate_batch", map[string]bool{"trigger_generate_batch": true}) {
		t.Fatal("batch requests must be sequential with per-turn approval metadata")
	}
	box := &toolBox{ctx: context.Background(), client: batchClient(t, batchClientJSON), allowed: []string{"read_skill"}, pinnedCeiling: true,
		skills: []skillPackage{{ID: "copy", Name: "文案", Prompt: "仅写提示词", Tools: []string{"trigger_generate_batch"}}}}
	box.readSkill(map[string]any{"skill_id": "copy"})
	if raw := box.run("trigger_generate_batch", map[string]any{"sourceId": "draft:a", "entryIds": []any{"image:1"}}); !toolFailed(raw) || clientAction(raw) != nil {
		t.Fatalf("skill permissions expanded %s", raw)
	}
	if strings.Contains(viewCapabilities("canvas", nil), "\"trigger_generate_batch\"") {
		t.Fatal("batch capability advertised without a client manifest")
	}
	if raw := viewCapabilities("canvas", box.client); !strings.Contains(raw, "\"trigger_generate_batch\"") {
		t.Fatalf("missing batch capability %s", raw)
	}
}

func TestGenerateBatchActionPersistsBeforeReceiptEvents(t *testing.T) {
	box := &toolBox{ctx: context.Background(), client: batchClient(t, batchClientJSON), allowed: []string{"trigger_generate_batch"}}
	raw := box.run("trigger_generate_batch", map[string]any{"sourceId": "draft:a", "entryIds": []any{"image:1"}})
	var stored []byte
	events := []map[string]any{}
	loop := &agentLoop{send: func(event map[string]any) { events = append(events, event) }, persist: func(item map[string]any) { stored, _ = json.Marshal(item) }}
	loop.finishCall(map[string]any{"id": "tool:1", "name": "trigger_generate_batch"}, raw, "")
	if !strings.Contains(string(stored), "\"operationId\"") || !strings.Contains(string(stored), "\"generate_batch\"") {
		t.Fatalf("receipt action missing from persistent snapshot %s", stored)
	}
	for _, event := range events {
		if event["type"] == "item/toolCall/completed" || event["type"] == "tool_result" {
			action, _ := event["action"].(map[string]any)
			if action["action"] != "generate_batch" || action["operationId"] == nil {
				t.Fatalf("missing streamed action %#v", event)
			}
		}
	}
}

func TestGenerateBatchInvalidContextRejectedBeforeExecution(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(`{"messages":[{"role":"user","content":"生成"}],"clientContext":{"generationBatches":null}}`))
	StartTurn(config.Config{}).ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "generationBatches") {
		t.Fatalf("invalid context was not rejected before execution: %d %s", response.Code, response.Body.String())
	}
}
