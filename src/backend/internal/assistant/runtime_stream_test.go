package assistant

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStreamDeltasKeepItemIdentityAndRetryBeforeFirstToken(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if requests == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = io.WriteString(w, `{"error":{"message":"slow down"}}`)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"先想\"}}]}\n\n")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"清楚\"}}]}\n\n")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"，贝壳\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":4}}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	events := []map[string]any{}
	loop := testLoop(server.URL, func(event map[string]any) { events = append(events, event) })
	round, err := loop.complete(true, false)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 {
		t.Fatalf("requests %d", requests)
	}
	loop.noteMessage(round)

	reasonID := ""
	messageID := ""
	var reasonDeltas, messageDeltas []string
	for _, event := range events {
		switch event["type"] {
		case "item/started":
			if event["kind"] == "agentReasoning" {
				reasonID = event["itemId"].(string)
			}
			if event["kind"] == "agentMessage" {
				messageID = event["itemId"].(string)
			}
		case "item/agentReasoning/delta":
			if event["itemId"] != reasonID {
				t.Fatalf("reasoning item %v", event["itemId"])
			}
			reasonDeltas = append(reasonDeltas, event["delta"].(string))
		case "item/agentMessage/delta":
			if event["itemId"] != messageID {
				t.Fatalf("message item %v", event["itemId"])
			}
			messageDeltas = append(messageDeltas, event["delta"].(string))
		}
	}
	if reasonID == "" || messageID == "" || reasonID == messageID {
		t.Fatalf("ids reason=%s message=%s", reasonID, messageID)
	}
	if strings.Join(reasonDeltas, "") != "先想清楚" || strings.Join(messageDeltas, "") != "你好，贝壳" {
		t.Fatalf("deltas %v %v", reasonDeltas, messageDeltas)
	}
	if !hasCompleted(events, "item/agentReasoning/completed", reasonID, "先想清楚") || !hasCompleted(events, "item/agentMessage/completed", messageID, "你好，贝壳") {
		t.Fatalf("completed %#v", events)
	}
}

func TestStreamDoesNotRetryAfterFirstDelta(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"半句\"}}]}\n\n")
	}))
	defer server.Close()

	loop := testLoop(server.URL, func(map[string]any) {})
	_, err := loop.complete(true, false)
	if err == nil {
		t.Fatal("expected incomplete stream error")
	}
	if requests != 1 {
		t.Fatalf("retried after first delta: %d", requests)
	}
}

func TestStreamRetriesServerErrorBeforeFirstDelta(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if requests == 1 {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, `{"error":{"message":"gateway"}}`)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"恢复了\"},\"finish_reason\":\"stop\"}]}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	loop := testLoop(server.URL, func(map[string]any) {})
	round, err := loop.complete(true, false)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || round.content != "恢复了" {
		t.Fatalf("requests %d content %q", requests, round.content)
	}
}

func TestCompletionBodyCapsHighEffort(t *testing.T) {
	cases := []struct {
		model, effort, key string
		want               int
	}{
		{"gemini-3.7-flash", "high", "max_tokens", 16384},
		{"gemini-3.7-flash", "xhigh", "max_tokens", 16384},
		{"gemini-3.7-flash", "medium", "max_tokens", 16384},
		{"gemini-3.7-flash", "low", "max_tokens", 8192},
		{"gpt-6-luna", "high", "max_completion_tokens", 16384},
		{"kimi-k3", "xhigh", "max_completion_tokens", 16384},
	}
	for _, item := range cases {
		body, err := completionBody(item.model, []map[string]any{{"role": "user", "content": "你好"}}, nil, item.effort, true)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			t.Fatalf("json %s", item.model)
		}
		got, _ := payload[item.key].(float64)
		if int(got) != item.want {
			t.Fatalf("%s %s %s = %v, want %d", item.model, item.effort, item.key, payload[item.key], item.want)
		}
		for _, key := range []string{"max_tokens", "max_completion_tokens"} {
			if value, ok := payload[key].(float64); ok && int(value) > 16384 {
				t.Fatalf("%s %s = %v", item.model, key, value)
			}
		}
	}
}

func TestStreamClampsNamedCompletionLimit(t *testing.T) {
	requests := 0
	var second float64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		raw, _ := io.ReadAll(r.Body)
		var payload map[string]any
		_ = json.Unmarshal(raw, &payload)
		if requests == 1 {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"error":{"message":"max_tokens is too large: 32768. This model supports at most 16384 completion tokens, whereas you provided 32768."}}`)
			return
		}
		second, _ = payload["max_tokens"].(float64)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"好的\"},\"finish_reason\":\"stop\"}]}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	loop := testLoop(server.URL, func(map[string]any) {})
	body := []byte(`{"model":"gemini-3.7-flash","messages":[{"role":"user","content":"你好"}],"stream":true,"max_tokens":32768}`)
	round, err := loop.streamModel(body, false)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || int(second) != 16384 || round.content != "好的" {
		t.Fatalf("requests %d tokens %v content %q", requests, second, round.content)
	}
}

func testLoop(base string, send func(map[string]any)) *agentLoop {
	return &agentLoop{
		ctx:      context.Background(),
		creds:    gatewayCreds{baseURL: base, apiKey: "secret"},
		models:   []string{"gemini-3.7-flash"},
		messages: []map[string]any{{"role": "user", "content": "你好"}},
		budget:   newBudget(),
		turnID:   "turn-1",
		send:     send,
		persist:  func(map[string]any) {},
	}
}

func hasCompleted(events []map[string]any, kind, itemID, content string) bool {
	for _, event := range events {
		if event["type"] == kind && event["itemId"] == itemID && event["content"] == content {
			return true
		}
	}
	return false
}
