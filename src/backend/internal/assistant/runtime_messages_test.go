package assistant

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTurnMessagesExposeVideoReferencesAcrossConversation(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	raw := json.RawMessage(`[{"role":"user","content":"分析视频","attachments":[{"type":"video","name":"参考.webm","url":"/storage/local/assistant-attachments/reference.webm"}]},{"role":"assistant","content":"已查看采样画面"},{"role":"user","content":"继续细化最后一个镜头"}]`)
	messages, _ := turnMessages(httptest.NewRequest("POST", "/", nil), "video-thread", map[string]json.RawMessage{"messages": raw})
	if len(messages) != 3 {
		t.Fatalf("history and video instructions: %#v", messages)
	}
	content, _ := messages[0]["content"].(string)
	if !strings.Contains(content, "/storage/local/assistant-attachments/reference.webm") || !strings.Contains(content, "参考.webm") {
		t.Fatalf("video reference lost: %s", content)
	}
	if messages[2]["content"] != "继续细化最后一个镜头" {
		t.Fatalf("latest prompt changed: %#v", messages[2])
	}

}

func TestTurnMessagesInlineLatestImagesOnly(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", dir)
	rel := "local/assistant-attachments/sample.jpg"
	path := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte{0xff, 0xd8, 0xff, 0xd9}, 0o600); err != nil {
		t.Fatal(err)
	}

	body, err := json.Marshal([]map[string]any{
		{"role": "user", "content": "上一轮", "attachments": []map[string]any{{"type": "image", "url": "data:image/png;base64,aGk="}}},
		{"role": "assistant", "content": "好的"},
		{"role": "user", "content": "帮我反推生成这张图片的绘图提示词", "attachments": []map[string]any{
			{"type": "image", "url": ""},
			{"type": "document", "url": "data:image/png;base64,aGk="},
			{"type": "image", "url": "data:image/png;base64,aGk="},
			{"type": "image", "url": "/storage/" + rel},
			{"type": "image", "url": "data:image/png;base64,QQ=="},
			{"type": "image", "url": "data:image/png;base64,Qg=="},
			{"type": "image", "url": "data:image/png;base64,Qw=="},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	payload := map[string]json.RawMessage{"messages": body}
	messages, _ := turnMessages(httptest.NewRequest("POST", "/", nil), "thread-images", payload)

	var history, current map[string]any
	note := ""
	for _, message := range messages {
		role, _ := message["role"].(string)
		switch role {
		case "user":
			if _, ok := message["content"].(string); ok {
				history = message
			} else {
				current = message
			}
		case "system":
			if text, _ := message["content"].(string); text == imageAttachedNote {
				note = text
			}
		}
	}
	if history == nil || history["content"] != "上一轮" {
		t.Fatalf("history kept text, got %#v", history)
	}
	parts, _ := current["content"].([]any)
	if len(parts) != 5 {
		t.Fatalf("text plus 4 images, got %#v", current["content"])
	}
	first, _ := parts[0].(map[string]any)
	if first["text"] != "帮我反推生成这张图片的绘图提示词" {
		t.Fatalf("prompt text %#v", first)
	}
	image, _ := parts[1].(map[string]any)
	nested, _ := image["image_url"].(map[string]any)
	if image["type"] != "image_url" || nested["url"] != "data:image/png;base64,aGk=" {
		t.Fatalf("first image %#v", image)
	}
	stored, _ := parts[2].(map[string]any)
	storedURL, _ := stored["image_url"].(map[string]any)
	url, _ := storedURL["url"].(string)
	if len(url) < 20 || url[:5] != "data:" {
		t.Fatalf("storage image %#v", stored)
	}
	if note != imageAttachedNote {
		t.Fatalf("note %q", note)
	}
}

func TestTurnMessagesOnlyInlineImagesFromRequestWorkspace(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	owner, other := strings.Repeat("a", 64), strings.Repeat("b", 64)
	for _, rel := range []string{owner + "/assistant-attachments/sample.jpg", "assistant-attachments/legacy.jpg", "official/sample.jpg"} {
		file := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(file), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte{0xff, 0xd8, 0xff, 0xd9}, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		name, workspace, rel string
		want                 bool
	}{
		{"owned", owner, owner + "/assistant-attachments/sample.jpg?preview=1", true},
		{"other workspace", other, owner + "/assistant-attachments/sample.jpg", false},
		{"local cannot read hosted workspace", "local", owner + "/assistant-attachments/sample.jpg", false},
		{"local legacy", "local", "assistant-attachments/legacy.jpg", true},
		{"hosted cannot read legacy", other, "assistant-attachments/legacy.jpg", false},
		{"official needs explicit access", other, "official/sample.jpg", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal([]map[string]any{{"role": "user", "content": "分析图片", "attachments": []map[string]any{{"type": "image", "url": "/storage/" + tc.rel}}}})
			r := httptest.NewRequest("POST", "/api/assistant/turn/start", nil)
			r = r.WithContext(httpx.WithWorkspace(r.Context(), tc.workspace))
			messages, _ := turnMessages(r, "image-scope", map[string]json.RawMessage{"messages": body})
			wire, _ := json.Marshal(messages)
			if got := strings.Contains(string(wire), "data:image/jpeg;base64,"); got != tc.want {
				t.Fatalf("inlined=%v, want %v", got, tc.want)
			}
		})
	}
}

func TestNativeContinuationPersistsPrivatelyAndIsolatesRoutes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "continuation.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, sql := range []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
		`INSERT INTO AssistantTurn VALUES ('turn', 'space', 'thread', 'claude-haiku-5-5', 'completed', '2026-10-20', NULL, 1, 2, '{}')`,
	} {
		if _, err = db.Exec(sql); err != nil {
			t.Fatal(err)
		}
	}
	cfg := config.Config{DatabaseURL: "file:" + path}
	creds := gatewayCreds{baseURL: "https://relay.example", apiKey: "test-key", protocol: "anthropic"}
	loop := &agentLoop{creds: creds, models: []string{"claude-haiku-5-5"}}
	loop.pushAssistant(modelRound{content: "相同的最终正文", native: map[string]any{
		"protocol": "anthropic", "model": "claude-haiku-5-5", "content": []any{
			map[string]any{"type": "thinking", "thinking": "summary", "signature": "private-native-signature"},
			map[string]any{"type": "text", "text": "相同的最终正文"},
		},
	}})
	ctx := context.Background()
	saveNativeContinuation(ctx, cfg, "space", "turn", loop)
	for _, tc := range []struct {
		space, thread, model string
		creds                gatewayCreds
		want                 bool
	}{
		{"space", "thread", "claude-haiku-5-5", creds, true},
		{"other", "thread", "claude-haiku-5-5", creds, false},
		{"space", "other", "claude-haiku-5-5", creds, false},
		{"space", "thread", "claude-sonnet-5", creds, false},
		{"space", "thread", "claude-haiku-5-5", gatewayCreds{baseURL: creds.baseURL, apiKey: "other", protocol: creds.protocol}, false},
		{"space", "thread", "claude-haiku-5-5", gatewayCreds{baseURL: "https://other.example", apiKey: creds.apiKey, protocol: creds.protocol}, false},
		{"space", "thread", "claude-haiku-5-5", gatewayCreds{baseURL: creds.baseURL, apiKey: creds.apiKey, protocol: "openai"}, false},
	} {
		messages := []map[string]any{{"role": "assistant", "content": "相同的最终正文"}}
		restoreNativeContinuations(ctx, cfg, tc.space, tc.thread, tc.model, tc.creds, messages)
		if (messages[0]["native_content"] != nil) != tc.want {
			t.Fatalf("route isolation: %+v", tc)
		}
	}
	repeated := []map[string]any{{"role": "assistant", "content": "相同的最终正文"}, {"role": "assistant", "content": "相同的最终正文"}}
	restoreNativeContinuations(ctx, cfg, "space", "thread", "claude-haiku-5-5", creds, repeated)
	if repeated[0]["native_content"] != nil || repeated[1]["native_content"] == nil {
		t.Fatal("a saved signature was reused for duplicate visible replies")
	}
	snapshot, err := readTurnSnapshot(ctx, cfg, "space", "turn")
	if err != nil {
		t.Fatal(err)
	}
	wire, _ := json.Marshal(snapshot)
	if strings.Contains(string(wire), "private-native-signature") || strings.Contains(string(wire), "_nativeContinuation") {
		t.Fatal("private continuation leaked in public snapshot")
	}
}

func TestNativeGeminiStreamPreservesSignedToolCalls(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1beta/models/gemini-4-argon:streamGenerateContent" || r.URL.Query().Get("alt") != "sse" || r.Header.Get("x-goog-api-key") != "test-key" {
			t.Errorf("native request %s %v", r.URL, r.Header)
		}
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		encoded, _ := json.Marshal(payload)
		if strings.Contains(string(encoded), "reasoning_effort") {
			t.Error("OpenAI effort sent to Gemini")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		if calls == 1 {
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"name\":\"update_plan\",\"args\":{\"steps\":[]}},\"thoughtSignature\":\"signed-tool-block\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":2,\"candidatesTokenCount\":1,\"thoughtsTokenCount\":3,\"totalTokenCount\":6}}\n\n")
			return
		}
		if strings.Contains(string(encoded), `"id":"call_gemini_0"`) {
			t.Error("local tool ID was incorrectly sent as a vendor call ID")
		}
		if !strings.Contains(string(encoded), "signed-tool-block") || !strings.Contains(string(encoded), "functionResponse") {
			t.Errorf("tool signature or result lost: %s", encoded)
		}
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"已完成\",\"thoughtSignature\":\"signed-final-block\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"promptTokenCount\":3,\"candidatesTokenCount\":2,\"totalTokenCount\":5}}\n\n")
	}))
	defer server.Close()
	useAssistantTestClient(t, server.Client())
	loop := testLoop(server.URL, func(event map[string]any) {
		encoded, _ := json.Marshal(event)
		if strings.Contains(string(encoded), "signed-tool-block") {
			t.Error("signature leaked to UI")
		}
	})
	loop.creds = gatewayCreds{baseURL: server.URL, apiKey: "test-key"}
	loop.models = []string{"gemini-4-argon"}
	loop.effort = "high"
	loop.tools = []map[string]any{{"type": "function", "function": map[string]any{"name": "update_plan", "parameters": map[string]any{"type": "object", "properties": map[string]any{}}}}}
	first, err := loop.complete(false, true)
	if err != nil || len(first.toolCalls) != 1 || first.native == nil {
		t.Fatalf("first=%+v error=%v", first, err)
	}
	loop.pushToolMessage(first)
	loop.messages = append(loop.messages, map[string]any{"role": "tool", "tool_call_id": first.toolCalls[0].id, "content": `{"success":true}`})
	last, err := loop.complete(true, false)
	if err != nil || last.content != "已完成" || last.native == nil || calls != 2 {
		t.Fatalf("last=%+v requests=%d error=%v", last, calls, err)
	}
}

func TestNativeStreamFailureDoesNotRetryOrSwitchProtocol(t *testing.T) {
	for _, status := range []int{400, 401, 429, 502} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.WriteHeader(status)
				fmt.Fprint(w, `{"error":{"message":"native unavailable"}}`)
			}))
			defer server.Close()
			useAssistantTestClient(t, server.Client())
			loop := testLoop(server.URL, func(map[string]any) {})
			loop.creds.protocol = "gemini"
			loop.models = []string{"gemini-4-argon", "gemini-3.8-flash", "gpt-6-sol"}
			if _, err := loop.complete(true, false); err == nil || requests != 1 {
				t.Fatalf("requests=%d error=%v", requests, err)
			}
		})
	}
}

func TestNativeModelRoundRejectsInvalidArguments(t *testing.T) {
	data := map[string]any{"choices": []any{map[string]any{"finish_reason": "tool_calls", "message": map[string]any{"tool_calls": []any{map[string]any{"id": "call-1", "function": map[string]any{"name": "execute_code", "arguments": "{incomplete"}}}}}}}
	if _, err := nativeModelRound(data); err == nil {
		t.Fatal("incomplete call accepted")
	}
}

func TestNativeTurnProtocolAndEffortValidation(t *testing.T) {
	for _, input := range []string{`{"messages":[{"role":"user","content":"hi"}],"textProtocol":"invalid"}`, `{"messages":[{"role":"user","content":"hi"}],"reasoningEffort":"extreme"}`} {
		var payload map[string]json.RawMessage
		_ = json.Unmarshal([]byte(input), &payload)
		if turnStartError(payload) == "" {
			t.Fatalf("accepted invalid request %s", input)
		}
	}
	if nativeRouteHash(gatewayCreds{baseURL: "https://gateway.example", apiKey: "one"}) == nativeRouteHash(gatewayCreds{baseURL: "https://gateway.example", apiKey: "two"}) {
		t.Fatal("continuation credential isolation lost")
	}
}

func TestNativeCancelledRequestDoesNotCallUpstream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	loop := testLoop("https://gateway.example", func(map[string]any) {})
	loop.ctx = ctx
	loop.creds.protocol = "anthropic"
	if _, err := loop.complete(true, false); err == nil {
		t.Fatal("cancelled request accepted")
	}
}
