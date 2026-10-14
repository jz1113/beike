package assistant

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
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
	cfg := config.Config{DatabaseURL: "file:" + dbPath, Upstream: "http://127.0.0.1:1"}
	body := `{"threadId":"thread-1","customBaseUrl":"` + upstream.URL + `","customApiKey":"test-key","messages":[{"role":"user","content":"请整理这段说明"}]}`
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
	cfg := config.Config{Upstream: "http://127.0.0.1:1"}
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
	Media(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "附件保存失败") || strings.Contains(response.Body.String(), "上游") {
		t.Fatalf("media %d %s", response.Code, response.Body.String())
	}
}
