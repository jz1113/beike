package assistant

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestDeclinedToolStaysDeclinedAndConstrainsReply(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	var sent []map[string]any
	loop := &agentLoop{
		mu:       &sync.Mutex{},
		send:     func(event map[string]any) { sent = append(sent, event) },
		persist:  func(map[string]any) {},
		results:  &resultStore{},
		models:   []string{"gpt"},
		space:    "space",
		turnID:   "turn",
		threadID: "thread",
	}
	item := map[string]any{
		"id": "tool_1", "kind": "toolCall", "name": "deconstruct_image", "displayName": "反推图片提示词",
		"createdAt": time.Now().UnixMilli(),
	}
	result := toolOutcome(false, "declined", "用户拒绝了此操作")
	var parsed map[string]any
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed["success"] != false || parsed["outcome"] != "declined" || parsed["error"] != "用户拒绝了此操作" {
		t.Fatalf("payload %#v", parsed)
	}
	loop.mu.Lock()
	if got := loop.finishCall(item, result, "declined"); got != result || item["status"] != "declined" {
		t.Fatalf("status %#v result %s", item["status"], got)
	}
	loop.mu.Unlock()
	var completed map[string]any
	for _, event := range sent {
		if event["type"] == "item/toolCall/completed" {
			completed = event
		}
	}
	if completed["status"] != "declined" || completed["summary"] != "用户拒绝了此操作" {
		t.Fatalf("event %#v", completed)
	}
	loop.recordTool(modelToolCall{id: "call_1", name: "deconstruct_image"}, result)
	loop.flushToolNotes()
	note, _ := loop.messages[len(loop.messages)-1]["content"].(string)
	if !strings.Contains(note, "没有执行") || !strings.Contains(note, "直接回答") {
		t.Fatalf("note %q", note)
	}
	fields := itemFields(item)
	if fields.status != "declined" || fields.summary != "用户拒绝了此操作" {
		t.Fatalf("stored %#v", fields)
	}
	if storedToolStatus("cancelled") != "cancelled" || storedToolStatus("pending") != "running" {
		t.Fatal("status restore")
	}
}

func TestFailedToolConstrainsReplyWithoutDeclineWording(t *testing.T) {
	loop := &agentLoop{results: &resultStore{}}
	loop.recordTool(modelToolCall{id: "call_2", name: "query_asset_library"}, toolJSON(false, "上游超时"))
	loop.recordTool(modelToolCall{id: "call_3", name: "list_user_products"}, toolJSON(false, "查询失败"))
	loop.flushToolNotes()
	if len(loop.messages) != 4 || loop.messages[0]["role"] != "tool" || loop.messages[1]["role"] != "tool" || loop.messages[2]["role"] != "system" {
		t.Fatalf("tool results stay together, got %#v", loop.messages)
	}
	note, _ := loop.messages[len(loop.messages)-1]["content"].(string)
	if !strings.Contains(note, "没有完成") || strings.Contains(note, "直接回答") {
		t.Fatalf("note %q", note)
	}
}
