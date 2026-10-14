package assistant

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestChatMarksDeprecated(t *testing.T) {
	response := httptest.NewRecorder()
	Chat(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assistant/chat", strings.NewReader(`{}`)))
	if response.Code != http.StatusBadRequest || response.Header().Get("Deprecation") != "true" || !strings.Contains(response.Header().Get("Link"), "/api/assistant/turn/start") {
		t.Fatalf("chat %d %s %v", response.Code, response.Body.String(), response.Header())
	}
}

func TestAssistantTurnValidation(t *testing.T) {
	cfg := config.Config{Upstream: "http://127.0.0.1:1"}
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
