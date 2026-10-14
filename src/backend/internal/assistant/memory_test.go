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

func TestAssistantMemory(t *testing.T) {
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	dbPath := filepath.Join(t.TempDir(), "memory.db")
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
	handler := Memory(config.Config{DatabaseURL: "file:" + dbPath})
	missing := httptest.NewRecorder()
	long := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/long/memory", nil)
	long.SetPathValue("threadId", strings.Repeat("a", 257))
	handler.ServeHTTP(missing, long)
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "会话标识无效") {
		t.Fatalf("id %d %s", missing.Code, missing.Body.String())
	}
	fresh := httptest.NewRecorder()
	freshRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/thread-1/memory", nil)
	freshRequest.SetPathValue("threadId", "thread-1")
	handler.ServeHTTP(fresh, freshRequest)
	if fresh.Code != http.StatusOK || !strings.Contains(fresh.Body.String(), `"enabled":true`) || !strings.Contains(fresh.Body.String(), `"pendingCount":0`) {
		t.Fatalf("get %d %s", fresh.Code, fresh.Body.String())
	}
	disabled := httptest.NewRecorder()
	put := httptest.NewRequest(http.MethodPut, "/api/assistant/threads/thread-1/memory", strings.NewReader(`{"enabled":false}`))
	put.SetPathValue("threadId", "thread-1")
	handler.ServeHTTP(disabled, put)
	if disabled.Code != http.StatusOK || !strings.Contains(disabled.Body.String(), `"enabled":false`) {
		t.Fatalf("put %d %s", disabled.Code, disabled.Body.String())
	}
	deleted := httptest.NewRecorder()
	deletedRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/gone/memory", nil)
	deletedRequest.SetPathValue("threadId", "gone")
	handler.ServeHTTP(deleted, deletedRequest)
	if deleted.Code != http.StatusNotFound || !strings.Contains(deleted.Body.String(), "会话已删除") {
		t.Fatalf("deleted %d %s", deleted.Code, deleted.Body.String())
	}
}
