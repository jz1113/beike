package sessions

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"beike.local/cloud/src/backend/internal/assistant"
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const sessionBodyLimit = 64 << 20

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
		db, err := httpx.OpenDB(cfg)
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
	db, err := httpx.OpenDB(cfg)
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
	return false
}
