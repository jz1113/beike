package assistant

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestTurnExecutesToolsAndPersists(t *testing.T) {
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "text/event-stream")
		if calls == 1 {
			_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"update_plan\",\"arguments\":\"{\\\"steps\\\":[{\\\"title\\\":\\\"整理\\\",\\\"status\\\":\\\"completed\\\",\\\"evidence\\\":\\\"已核对\\\"}]}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\ndata: [DONE]\n\n"))
			return
		}
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"已完成\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n"))
	}))
	defer upstream.Close()
	useAssistantTestClient(t, upstream.Client())
	dbPath := filepath.Join(t.TempDir(), "assistant.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	schema := []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, workspaceId TEXT, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, completedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
	}
	for _, statement := range schema {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	body := `{"threadId":"thread-1","textProtocol":"openai","customBaseUrl":"` + upstream.URL + `","customApiKey":"test-key","messages":[{"role":"user","content":"请整理这段说明"}]}`
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(body))
	StartTurn(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "已完成") || !strings.Contains(response.Body.String(), "turn/completed") || strings.Contains(response.Body.String(), "上游") {
		t.Fatalf("start %d %s", response.Code, response.Body.String())
	}
	list := httptest.NewRecorder()
	listRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/thread-1/turns", nil)
	listRequest.SetPathValue("threadId", "thread-1")
	ThreadTurns(cfg).ServeHTTP(list, listRequest)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), `"status":"completed"`) {
		t.Fatalf("list %d %s", list.Code, list.Body.String())
	}
	stored, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	var turnID string
	if err := stored.QueryRow(`SELECT "id" FROM "AssistantTurn"`).Scan(&turnID); err != nil {
		t.Fatal(err)
	}
	_ = stored.Close()
	snapshot := httptest.NewRecorder()
	snapshotRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/turns/"+turnID+"/snapshot", nil)
	snapshotRequest.SetPathValue("turnId", turnID)
	TurnSnapshot(cfg).ServeHTTP(snapshot, snapshotRequest)
	if snapshot.Code != http.StatusOK || !strings.Contains(snapshot.Body.String(), "已完成") {
		t.Fatalf("snapshot %d %s", snapshot.Code, snapshot.Body.String())
	}
	recover := httptest.NewRecorder()
	recoverRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/turns/"+turnID+"/recover", nil)
	recoverRequest.SetPathValue("turnId", turnID)
	TurnRecover(cfg).ServeHTTP(recover, recoverRequest)
	if recover.Code != http.StatusOK || !strings.Contains(recover.Body.String(), "已完成") {
		t.Fatalf("recover %d %s", recover.Code, recover.Body.String())
	}
}

func TestApprovalAndInterruptStayLocal(t *testing.T) {
	cfg := config.Config{}
	approve := httptest.NewRecorder()
	ApproveTurn(cfg).ServeHTTP(approve, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/approve", strings.NewReader(`{"turnId":"t","approvalId":"a","decision":"accept"}`)))
	if approve.Code != http.StatusNotFound || !strings.Contains(approve.Body.String(), "审批请求不存在或已过期") {
		t.Fatalf("approve %d %s", approve.Code, approve.Body.String())
	}
	interrupt := httptest.NewRecorder()
	InterruptTurn(cfg).ServeHTTP(interrupt, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/interrupt", strings.NewReader(`{"turnId":"t"}`)))
	if interrupt.Code != http.StatusOK || !strings.Contains(interrupt.Body.String(), `"success":true`) {
		t.Fatalf("interrupt %d %s", interrupt.Code, interrupt.Body.String())
	}
}

func TestMediaDecodesLocallyWhenNotJPEG(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader("not-an-image"))
	request.Header.Set("Content-Type", "image/webp")
	Media(config.Config{}).ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "附件保存失败") || strings.Contains(response.Body.String(), "上游") {
		t.Fatalf("media %d %s", response.Code, response.Body.String())
	}
}

func TestDeclinedToolStaysDeclinedAndConstrainsReply(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	t.Cleanup(FlushTelemetry)
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

func TestVideoTurnAnalyzesNativeMediaWithoutLoadingSkills(t *testing.T) {
	defer FlushTelemetry()
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	dir := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", dir)
	video := append([]byte{0x1a, 0x45, 0xdf, 0xa3}, []byte("video fixture")...)
	path := filepath.Join(dir, "local", "assistant-attachments", "input.webm")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, video, 0o600); err != nil {
		t.Fatal(err)
	}
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		encoded, _ := json.Marshal(body)
		if body["tools"] != nil || body["toolConfig"] != nil || strings.Contains(string(encoded), "read_skill") {
			t.Error("ordinary video analysis must not load skills or offer agent tools")
		}
		if !strings.Contains(string(encoded), base64.StdEncoding.EncodeToString(video)) || !strings.Contains(string(encoded), `"mimeType":"video/webm"`) {
			t.Error("first model request did not contain the actual video")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"直接视频分析结果\"}]},\"finishReason\":\"STOP\"}]}\n\n")
	}))
	defer upstream.Close()
	useAssistantTestClient(t, upstream.Client())
	dbPath := filepath.Join(t.TempDir(), "video.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, schema := range []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, workspaceId TEXT, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, completedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
	} {
		if _, err := db.Exec(schema); err != nil {
			t.Fatal(err)
		}
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	for _, followup := range []bool{false, true} {
		messages := []map[string]any{{"role": "user", "content": "分析视频，写出逐镜生成提示词", "attachments": []map[string]any{{"type": "video", "url": "/storage/local/assistant-attachments/input.webm", "name": "参考视频"}}}}
		if followup {
			messages = append(messages, map[string]any{"role": "assistant", "content": "第一轮分析"}, map[string]any{"role": "user", "content": "继续细化最后一镜"})
		}
		body, _ := json.Marshal(map[string]any{
			"threadId": "video-thread", "model": "gemini-3.8-flash", "textProtocol": "gemini", "customBaseUrl": upstream.URL, "customApiKey": "test-key",
			"messages":     messages,
			"skillCatalog": []map[string]any{{"id": "video-teardown", "name": "拆解视频", "prompt": "先读取技能"}},
			"mcpServers":   []any{map[string]any{"url": "http://127.0.0.1:1/must-not-connect"}},
		})
		response := httptest.NewRecorder()
		StartTurn(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(string(body))))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "直接视频分析结果") || !strings.Contains(response.Body.String(), "turn/completed") || strings.Contains(response.Body.String(), `"type":"item/toolCall/started"`) {
			t.Fatalf("direct video turn: %d %s", response.Code, response.Body.String())
		}
	}
	if requests != 2 {
		t.Fatalf("each analysis should make one model request, got %d", requests)
	}
}

func TestProductIDTurnReturnsCachedProductWithoutModel(t *testing.T) {
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	t.Setenv("WANBANG_API_KEY", "")
	t.Setenv("WANBANG_API_SECRET", "")
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; http.Error(w, "unexpected model call", 500) }))
	defer upstream.Close()
	useAssistantTestClient(t, upstream.Client())
	dbPath := filepath.Join(t.TempDir(), "assistant-product.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, workspaceId TEXT, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, completedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
		`CREATE TABLE Product (id TEXT PRIMARY KEY, workspaceId TEXT, platform TEXT, itemId TEXT, title TEXT, picUrl TEXT, detailUrls TEXT, createdAt TEXT)`,
		`INSERT INTO Product VALUES ('product-1','local','jd','10231557417974','测试商品','https://img.example.com/main.jpg','{"main":["https://img.example.com/main.jpg"],"details":["https://img.example.com/detail.jpg"],"price":59}','2026-01-01')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	body, _ := json.Marshal(map[string]any{"turnId": "product-turn", "threadId": "product-thread", "model": "gpt-6-sol", "customBaseUrl": upstream.URL, "customApiKey": "test", "messages": []map[string]any{{"role": "user", "content": "10231557417974"}}})
	response := httptest.NewRecorder()
	StartTurn(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(string(body))))
	output := response.Body.String()
	for _, expected := range []string{`"modelUsed":"direct-collection"`, `"title":"测试商品"`, `"itemId":"10231557417974"`, `"mainImages":["https://img.example.com/main.jpg"]`, `"detailImages":["https://img.example.com/detail.jpg"]`, `"price":59`, `"productWidget"`} {
		if !strings.Contains(output, expected) {
			t.Errorf("missing %s in %s", expected, output)
		}
	}
	snapshot, err := readTurnSnapshot(context.Background(), cfg, "local", "product-turn")
	if err != nil {
		t.Fatal(err)
	}
	widget, ok := snapshot["productWidget"].(map[string]any)
	if !ok || widget["itemId"] != "10231557417974" || widget["title"] != "测试商品" {
		t.Fatalf("product widget missing from restored snapshot: %#v", snapshot)
	}
	if calls != 0 {
		t.Fatalf("model called %d times", calls)
	}
}
