package assistant

import (
	"encoding/json"
	"net/http"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const deletedThreadMessages = `{"version":1,"deleted":true}`

func Sessions(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "会话操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		rows, err := db.QueryContext(r.Context(), `
			SELECT "id", "title", "messagesJson", "allowedToolsJson", "createdAt", "updatedAt"
			FROM "AssistantThread"
			WHERE "workspaceId" = ? AND "messagesJson" != ?
			ORDER BY "updatedAt" DESC`, httpx.WorkspaceFrom(r), deletedThreadMessages)
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
				"createdAt": threadTime(createdAt), "updatedAt": threadTime(updatedAt),
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

func threadTime(raw string) int64 {
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed.UnixMilli()
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", raw); err == nil {
		return parsed.UnixMilli()
	}
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed.UnixMilli()
	}
	return 0
}
