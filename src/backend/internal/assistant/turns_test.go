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

func TestThreadTurnsRejectsMissingAndDeleted(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "turns.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssistantThread (id TEXT, workspaceId TEXT, messagesJson TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('gone','local',?)`, deletedThreadMessages); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := ThreadTurns(config.Config{DatabaseURL: "file:" + dbPath, Upstream: "http://127.0.0.1:1"})
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
	AllRuns(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(all, httptest.NewRequest(http.MethodGet, "/api/assistant/runs", nil))
	if all.Header().Get("Deprecation") != "true" || !strings.Contains(all.Header().Get("Link"), "/api/assistant/threads/:threadId/turns") {
		t.Fatalf("all runs headers %v", all.Header())
	}
	missing := httptest.NewRecorder()
	ThreadRuns(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/assistant/threads//runs", nil))
	if missing.Code != http.StatusBadRequest || missing.Header().Get("Deprecation") != "true" {
		t.Fatalf("thread runs %d %v", missing.Code, missing.Header())
	}
}

func TestTurnSnapshotRequiresID(t *testing.T) {
	handler := TurnSnapshot(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/assistant/turns//snapshot", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少 turnId") {
		t.Fatalf("snapshot %d %s", response.Code, response.Body.String())
	}
}
