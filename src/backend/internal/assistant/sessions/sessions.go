package sessions

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/assistant"
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

const sessionBodyLimit = 64 << 20

func Sessions(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		rows, err := db.QueryContext(r.Context(), `
			SELECT "id", "title", "messagesJson", "allowedToolsJson", "createdAt", "updatedAt"
			FROM "AssistantThread"
			WHERE "workspaceId" = ? AND "messagesJson" != ?
			ORDER BY "updatedAt" DESC`, httpx.WorkspaceFrom(r), assistant.DeletedThreadMessages)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		defer rows.Close()
		sessions := []map[string]any{}
		for rows.Next() {
			var id, title, messagesJSON, toolsJSON, createdAt, updatedAt string
			if err := rows.Scan(&id, &title, &messagesJSON, &toolsJSON, &createdAt, &updatedAt); err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
				return
			}
			sessions = append(sessions, map[string]any{
				"id": id, "title": title,
				"createdAt": assistant.ThreadTime(createdAt), "updatedAt": assistant.ThreadTime(updatedAt),
				"messages": parseMessages(messagesJSON), "allowedTools": parseAllowedTools(toolsJSON),
			})
		}
		if err := rows.Err(); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "sessions": sessions})
	})
}

// ExpireSessions removes conversation content after 24 hours from creation.
func ExpireSessions(ctx context.Context, cfg config.Config, now time.Time) (int, error) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return 0, err
	}
	defer db.Close()
	rows, err := db.QueryContext(ctx, `SELECT "id", "workspaceId" FROM "AssistantThread" WHERE "messagesJson" != ? AND julianday("createdAt") <= julianday(?)`, assistant.DeletedThreadMessages, now.Add(-24*time.Hour).UTC().Format(time.RFC3339Nano))
	if err != nil {
		return 0, err
	}
	type entry struct{ id, workspace string }
	var entries []entry
	for rows.Next() {
		var item entry
		if err = rows.Scan(&item.id, &item.workspace); err != nil {
			rows.Close()
			return 0, err
		}
		entries = append(entries, item)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()
	for i, item := range entries {
		req, _ := http.NewRequestWithContext(httpx.WithWorkspace(ctx, item.workspace), http.MethodDelete, "/", nil)
		if err = tombstoneSession(req, db, item.id); err != nil {
			return i, err
		}
		_ = os.Remove(assistant.MemoryPath(req, item.id))
	}
	return len(entries), nil
}

func parseMessages(raw string) []any {
	var messages []any
	if json.Unmarshal([]byte(raw), &messages) != nil || messages == nil {
		return []any{}
	}
	return messages
}

func parseAllowedTools(raw string) any {
	var stored any
	if json.Unmarshal([]byte(raw), &stored) != nil {
		return nil
	}
	switch typed := stored.(type) {
	case []any:
		if len(typed) == 0 {
			return nil
		}
		return stringList(typed)
	case map[string]any:
		if typed["version"] != float64(1) {
			return nil
		}
		tools, _ := typed["tools"].([]any)
		return stringList(tools)
	default:
		return nil
	}
}

func stringList(values []any) []string {
	names := []string{}
	for _, value := range values {
		if text, ok := value.(string); ok {
			names = append(names, text)
		}
	}
	return names
}

func DeleteSession(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" || len(id) > 255 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 id"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		if err := tombstoneSession(r, db, id); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		_ = os.Remove(assistant.MemoryPath(r, id))
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
		"已删除对话", assistant.DeletedThreadMessages, `{"version":1,"tools":[]}`, now, id, workspace)
	if err != nil {
		return err
	}
	updated, _ := result.RowsAffected()
	if updated == 0 {
		if _, err := db.ExecContext(r.Context(), `
			INSERT INTO "AssistantThread" ("id", "workspaceId", "title", "messagesJson", "allowedToolsJson", "createdAt", "updatedAt")
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, workspace, "已删除对话", assistant.DeletedThreadMessages, `{"version":1,"tools":[]}`, now, now); err != nil {
			return err
		}
	}
	_, _ = db.ExecContext(r.Context(), `
		DELETE FROM "AssistantTurnItem"
		WHERE "turnId" IN (SELECT "id" FROM "AssistantTurn" WHERE "threadId" = ? AND "workspaceId" = ?)`, id, workspace)
	_, _ = db.ExecContext(r.Context(), `DELETE FROM "AssistantTurn" WHERE "threadId" = ? AND "workspaceId" = ?`, id, workspace)
	return nil
}

func SaveSessions(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, sessionBodyLimit+1))
		if err != nil || len(bytes.TrimSpace(body)) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "会话内容过大或为空"})
			return
		}
		if len(body) > sessionBodyLimit {
			httpx.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"success": false, "error": "会话内容过大或为空"})
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效 JSON"})
			return
		}
		sessions, _ := payload["sessions"].([]any)
		if len(sessions) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "sessions 不能为空"})
			return
		}
		if onlyEmptyDefault(sessions) && workspaceHasMessages(r, cfg) {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "skipped": true, "reason": "拒绝用空默认会话覆盖已有对话"})
			return
		}
		if message := sessionBatchError(payload); message != "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
			return
		}
		if response, ok := discardOlderSnapshots(r, cfg, payload); ok {
			httpx.WriteJSON(w, http.StatusOK, response)
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		saved, currentID, err := saveSessionBatch(r.Context(), db, httpx.WorkspaceFrom(r), payload)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "count": saved, "skippedCount": len(sessions) - saved, "currentId": currentID,
		})
	})
}

func onlyEmptyDefault(sessions []any) bool {
	if len(sessions) != 1 {
		return false
	}
	session, ok := sessions[0].(map[string]any)
	if !ok {
		return false
	}
	title, _ := session["title"].(string)
	if strings.TrimSpace(title) != "新对话" {
		return false
	}
	messages, _ := session["messages"].([]any)
	return len(messages) == 0
}

func workspaceHasMessages(r *http.Request, cfg config.Config) bool {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return false
	}
	defer db.Close()
	rows, err := db.QueryContext(r.Context(), `
		SELECT "messagesJson" FROM "AssistantThread"
		WHERE "workspaceId" = ? AND "messagesJson" != ?`, httpx.WorkspaceFrom(r), assistant.DeletedThreadMessages)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if rows.Scan(&raw) != nil {
			continue
		}
		var messages []any
		if json.Unmarshal([]byte(raw), &messages) == nil && len(messages) > 0 {
			return true
		}
	}
	return rows.Err() != nil
}
