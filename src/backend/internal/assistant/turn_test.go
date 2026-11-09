package assistant

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestChatMarksDeprecated(t *testing.T) {
	response := httptest.NewRecorder()
	Chat(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assistant/chat", strings.NewReader(`{}`)))
	if response.Code != http.StatusBadRequest || response.Header().Get("Deprecation") != "true" || !strings.Contains(response.Header().Get("Link"), "/api/assistant/turn/start") {
		t.Fatalf("chat %d %s %v", response.Code, response.Body.String(), response.Header())
	}
}

func TestAssistantTurnValidation(t *testing.T) {
	cfg := config.Config{}
	start := StartTurn(cfg)
	missing := httptest.NewRecorder()
	start.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(`{}`)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "messages: Required") {
		t.Fatalf("start %d %s", missing.Code, missing.Body.String())
	}
	noUser := httptest.NewRecorder()
	start.ServeHTTP(noUser, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(`{"messages":[{"role":"assistant","content":"hi"}]}`)))
	if noUser.Code != http.StatusBadRequest || !strings.Contains(noUser.Body.String(), "缺少用户消息或附件") {
		t.Fatalf("user %d %s", noUser.Code, noUser.Body.String())
	}
	approve := ApproveTurn(cfg)
	decision := httptest.NewRecorder()
	approve.ServeHTTP(decision, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/approve", strings.NewReader(`{"turnId":"t","approvalId":"a","decision":"no"}`)))
	if decision.Code != http.StatusBadRequest || !strings.Contains(decision.Body.String(), "Invalid enum value") {
		t.Fatalf("approve %d %s", decision.Code, decision.Body.String())
	}
	interrupt := InterruptTurn(cfg)
	blank := httptest.NewRecorder()
	interrupt.ServeHTTP(blank, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/interrupt", strings.NewReader(`{"turnId":"  "}`)))
	if blank.Code != http.StatusBadRequest || !strings.Contains(blank.Body.String(), "turnId: String must contain at least 1 character(s)") {
		t.Fatalf("interrupt %d %s", blank.Code, blank.Body.String())
	}
}

func TestThreadTurnsRejectsMissingAndDeleted(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "turns.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssistantThread (id TEXT, workspaceId TEXT, messagesJson TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('gone','local',?)`, DeletedThreadMessages); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := ThreadTurns(config.Config{DatabaseURL: "file:" + dbPath})
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/assistant/threads//turns", nil))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "缺少 threadId") {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
	deleted := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/gone/turns", nil)
	request.SetPathValue("threadId", "gone")
	handler.ServeHTTP(deleted, request)
	if deleted.Code != http.StatusNotFound || !strings.Contains(deleted.Body.String(), "对话已删除") {
		t.Fatalf("deleted %d %s", deleted.Code, deleted.Body.String())
	}
}

func TestRunsMarkDeprecated(t *testing.T) {
	all := httptest.NewRecorder()
	AllRuns(config.Config{}).ServeHTTP(all, httptest.NewRequest(http.MethodGet, "/api/assistant/runs", nil))
	if all.Header().Get("Deprecation") != "true" || !strings.Contains(all.Header().Get("Link"), "/api/assistant/threads/:threadId/turns") {
		t.Fatalf("all runs headers %v", all.Header())
	}
	missing := httptest.NewRecorder()
	ThreadRuns(config.Config{}).ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/assistant/threads//runs", nil))
	if missing.Code != http.StatusBadRequest || missing.Header().Get("Deprecation") != "true" {
		t.Fatalf("thread runs %d %v", missing.Code, missing.Header())
	}
}

func TestTurnSnapshotRequiresID(t *testing.T) {
	handler := TurnSnapshot(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/assistant/turns//snapshot", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少 turnId") {
		t.Fatalf("snapshot %d %s", response.Code, response.Body.String())
	}
}

func TestSandboxPrintAndTimeout(t *testing.T) {
	output, err := RunSandbox("console.log(input.name)", map[string]any{"name": "贝壳"}, time.Second)
	if err != nil || len(output) != 1 || output[0] != "贝壳" {
		t.Fatalf("output %v err %v", output, err)
	}
	if _, err := RunSandbox(strings.Repeat("a", 32001), nil, time.Second); err == nil || !strings.Contains(err.Error(), "32000") {
		t.Fatalf("length %v", err)
	}
	if _, err := RunSandbox("while (true) {}", nil, 50*time.Millisecond); err == nil || !strings.Contains(err.Error(), "沙箱执行超时") {
		t.Fatalf("timeout %v", err)
	}
}

func TestSandboxToolAcceptsObjectLiteralAndContextCancel(t *testing.T) {
	var receivedObj, receivedJSON string
	tools := map[string]func(map[string]any) string{
		"echo": func(args map[string]any) string {
			v, _ := args["query"].(string)
			if receivedObj == "" {
				receivedObj = v
			} else {
				receivedJSON = v
			}
			return v
		},
	}
	out, err := runSandbox(context.Background(), `
		console.log(tools.echo({ query: "对象入参" }));
		console.log(tools.echo(JSON.stringify({ query: "字符串入参" })));
	`, nil, time.Second, tools)
	if err != nil || len(out) != 2 || receivedObj != "对象入参" || receivedJSON != "字符串入参" {
		t.Fatalf("unexpected tool args: out=%v err=%v obj=%q json=%q", out, err, receivedObj, receivedJSON)
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	if _, err := runSandbox(ctx, "while (true) {}", nil, 10*time.Second, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}
