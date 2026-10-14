package assistant

import (
	"database/sql"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func DeleteSession(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" || len(id) > 255 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 id"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		if err := tombstoneSession(r, db, id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		_ = os.Remove(memoryPath(r, id))
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	})
}

func tombstoneSession(r *http.Request, db *sql.DB, id string) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	workspace := httpx.WorkspaceFrom(r)
	result, err := db.ExecContext(r.Context(), `
		UPDATE "AssistantThread"
		SET "title" = ?, "messagesJson" = ?, "allowedToolsJson" = ?, "updatedAt" = ?
		WHERE "id" = ? AND "workspaceId" = ?`,
		"已删除对话", deletedThreadMessages, `{"version":1,"tools":[]}`, now, id, workspace)
	if err != nil {
		return err
	}
	updated, _ := result.RowsAffected()
	if updated == 0 {
		if _, err := db.ExecContext(r.Context(), `
			INSERT INTO "AssistantThread" ("id", "workspaceId", "title", "messagesJson", "allowedToolsJson", "createdAt", "updatedAt")
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, workspace, "已删除对话", deletedThreadMessages, `{"version":1,"tools":[]}`, now, now); err != nil {
			return err
		}
	}
	_, _ = db.ExecContext(r.Context(), `
		DELETE FROM "AssistantTurnItem"
		WHERE "turnId" IN (SELECT "id" FROM "AssistantTurn" WHERE "threadId" = ? AND "workspaceId" = ?)`, id, workspace)
	_, _ = db.ExecContext(r.Context(), `DELETE FROM "AssistantTurn" WHERE "threadId" = ? AND "workspaceId" = ?`, id, workspace)
	return nil
}
