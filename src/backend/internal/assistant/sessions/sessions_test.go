package sessions

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestDeleteSessionRequiresID(t *testing.T) {
	response := httptest.NewRecorder()
	DeleteSession(config.Config{Upstream: "http://127.0.0.1:1"}).ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/api/assistant/sessions", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少 id") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestSaveSessionsSkipsEmptyDefault(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "assistant-put.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssistantThread (
		id TEXT, workspaceId TEXT, title TEXT, messagesJson TEXT, allowedToolsJson TEXT, createdAt TEXT, updatedAt TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('keep','local','保留','[{"role":"user"}]','[]','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	response := httptest.NewRecorder()
	SaveSessions(config.Config{DatabaseURL: "file:" + dbPath, Upstream: "http://127.0.0.1:1"}).ServeHTTP(
		response, httptest.NewRequest(http.MethodPut, "/api/assistant/sessions", strings.NewReader(`{"sessions":[{"id":"new","title":"新对话","messages":[]}]}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "拒绝用空默认会话覆盖已有对话") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestSaveSessionsSkipsOlderSnapshot(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "assistant-stale.db")
	stored := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	insertThread(t, dbPath, stored.Format(time.RFC3339), `[{"role":"user","content":"保留"}]`)
	incoming := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli()
	body := fmt.Sprintf(`{"sessions":[{"id":"keep","title":"旧快照","updatedAt":%d,"messages":[{"role":"user","content":"覆盖"}]}],"currentId":"keep"}`, incoming)
	response := putSessions(t, dbPath, body)
	text := response.Body.String()
	if response.Code != http.StatusOK || !strings.Contains(text, `"count":0`) || !strings.Contains(text, `"skippedCount":1`) || !strings.Contains(text, `"currentId":"keep"`) {
		t.Fatalf("status %d body %s", response.Code, text)
	}
	kept := threadMessages(t, dbPath)
	if kept != `[{"role":"user","content":"保留"}]` {
		t.Fatalf("messages changed: %s", kept)
	}
}

func TestSaveSessionsForwardsWritableSnapshot(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "assistant-forward.db")
	stored := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	insertThread(t, dbPath, stored.Format(time.RFC3339), `[{"role":"user","content":"保留"}]`)
	same := stored.UnixMilli()
	equal := putSessions(t, dbPath, fmt.Sprintf(`{"sessions":[{"id":"keep","title":"同期","updatedAt":%d,"messages":[{"role":"user","content":"同期"}]}]}`, same))
	if equal.Code != http.StatusOK || !strings.Contains(equal.Body.String(), `"count":1`) {
		t.Fatalf("equal status %d body %s", equal.Code, equal.Body.String())
	}
	if !strings.Contains(threadMessages(t, dbPath), "同期") {
		t.Fatalf("equal snapshot was not stored: %s", threadMessages(t, dbPath))
	}
	newer := putSessions(t, dbPath, fmt.Sprintf(`{"sessions":[{"id":"keep","title":"更新","updatedAt":%d,"messages":[{"role":"user","content":"更新"}]},{"id":"other","title":"新","updatedAt":1,"messages":[]}]}`, stored.Add(24*time.Hour).UnixMilli()))
	if newer.Code != http.StatusOK || !strings.Contains(newer.Body.String(), `"count":2`) {
		t.Fatalf("mixed status %d body %s", newer.Code, newer.Body.String())
	}
	invalid := putSessions(t, dbPath, fmt.Sprintf(`{"sessions":[{"id":"keep","title":"坏","updatedAt":%d,"messages":[{"role":"tool","content":"x"}]}]}`, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli()))
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid status %d body %s", invalid.Code, invalid.Body.String())
	}
}

func insertThread(t *testing.T, dbPath, updatedAt, messages string) {
	t.Helper()
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS AssistantThread (
		id TEXT, workspaceId TEXT, title TEXT, messagesJson TEXT, allowedToolsJson TEXT, createdAt TEXT, updatedAt TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DELETE FROM AssistantThread WHERE id = 'keep'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('keep','local','保留',?,'[]','2026-01-01T00:00:00Z',?)`, messages, updatedAt); err != nil {
		t.Fatal(err)
	}
}

func threadMessages(t *testing.T, dbPath string) string {
	t.Helper()
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var messages string
	if err := db.QueryRow(`SELECT messagesJson FROM AssistantThread WHERE id = 'keep'`).Scan(&messages); err != nil {
		t.Fatal(err)
	}
	return messages
}

func putSessions(t *testing.T, dbPath, body string) *httptest.ResponseRecorder {
	t.Helper()
	response := httptest.NewRecorder()
	SaveSessions(config.Config{DatabaseURL: "file:" + dbPath, Upstream: "http://127.0.0.1:1"}).ServeHTTP(
		response, httptest.NewRequest(http.MethodPut, "/api/assistant/sessions", strings.NewReader(body)))
	return response
}

func TestSessionsHideDeletedThreads(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "assistant.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssistantThread (
		id TEXT, workspaceId TEXT, title TEXT, messagesJson TEXT, allowedToolsJson TEXT, createdAt TEXT, updatedAt TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('keep','local','保留','[{"role":"user"}]','{"version":1,"tools":["search"]}','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('gone','local','已删除','{"version":1,"deleted":true}','[]','2026-01-01T00:00:00Z','2026-01-03T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	response := httptest.NewRecorder()
	Sessions(config.Config{DatabaseURL: "file:" + dbPath}).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/assistant/sessions", nil))
	body := response.Body.String()
	if response.Code != http.StatusOK || !strings.Contains(body, `"id":"keep"`) || strings.Contains(body, `"id":"gone"`) {
		t.Fatalf("status %d body %s", response.Code, body)
	}
}
