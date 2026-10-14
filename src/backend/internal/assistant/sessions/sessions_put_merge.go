package sessions

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

const sessionTimeMax = 8_640_000_000_000_000

// Node skips a session when the stored updatedAt is strictly newer than the
// client time clamped to the server clock. The batch stays on the proxy path
// unless every session is skipped that way.
func discardOlderSnapshots(r *http.Request, cfg config.Config, payload map[string]any) (map[string]any, bool) {
	currentID, ok := sessionCurrentID(payload)
	if !ok {
		return nil, false
	}
	sessions, _ := payload["sessions"].([]any)
	if len(sessions) == 0 || len(sessions) > 50 {
		return nil, false
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, false
	}
	defer db.Close()
	now := time.Now().UnixMilli()
	for _, raw := range sessions {
		session, ok := raw.(map[string]any)
		if !ok || !sessionShapeValid(session) {
			return nil, false
		}
		updatedRaw, exists := session["updatedAt"]
		updated, valid := wholeMillis(updatedRaw)
		if !exists || !valid {
			return nil, false
		}
		id, _ := session["id"].(string)
		stored, found, ok := storedThreadMillis(r.Context(), db, httpx.WorkspaceFrom(r), strings.TrimSpace(id))
		if !ok || !found || stored <= clampedMillis(updated, now) {
			return nil, false
		}
	}
	return map[string]any{
		"success": true, "count": 0, "skippedCount": len(sessions), "currentId": currentID,
	}, true
}

func sessionCurrentID(payload map[string]any) (any, bool) {
	value, exists := payload["currentId"]
	if !exists || value == nil {
		return nil, true
	}
	text, ok := value.(string)
	if !ok || len(text) > 255 {
		return nil, false
	}
	if text == "" {
		return nil, true
	}
	return text, true
}

func sessionShapeValid(session map[string]any) bool {
	id, ok := session["id"].(string)
	trimmed := strings.TrimSpace(id)
	if !ok || trimmed == "" || len(trimmed) > 255 {
		return false
	}
	if !optionalBoundedString(session, "title", 500) {
		return false
	}
	if !optionalMillis(session, "createdAt") || !sessionMessagesValid(session) || !sessionToolsValid(session) {
		return false
	}
	return true
}

func optionalBoundedString(source map[string]any, key string, max int) bool {
	value, exists := source[key]
	if !exists || value == nil {
		return !exists
	}
	text, ok := value.(string)
	return ok && len(text) <= max
}

func optionalMillis(source map[string]any, key string) bool {
	value, exists := source[key]
	if !exists {
		return true
	}
	_, ok := wholeMillis(value)
	return ok
}

func wholeMillis(value any) (int64, bool) {
	number, ok := value.(float64)
	if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || number > sessionTimeMax || number != math.Trunc(number) {
		return 0, false
	}
	return int64(number), true
}

func clampedMillis(updated, now int64) int64 {
	if updated > now {
		return now
	}
	return updated
}

func sessionMessagesValid(session map[string]any) bool {
	value, exists := session["messages"]
	if !exists {
		return true
	}
	messages, ok := value.([]any)
	if !ok || len(messages) > 2000 {
		return false
	}
	for _, raw := range messages {
		message, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		role, _ := message["role"].(string)
		content, contentOK := message["content"].(string)
		if (role != "user" && role != "assistant" && role != "system") || !contentOK || len(content) > 100_000 {
			return false
		}
		if !messageAttachmentsValid(message) {
			return false
		}
	}
	return true
}

func messageAttachmentsValid(message map[string]any) bool {
	value, exists := message["attachments"]
	if !exists {
		return true
	}
	files, ok := value.([]any)
	if !ok || len(files) > 50 {
		return false
	}
	for _, raw := range files {
		file, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		kind, _ := file["type"].(string)
		if kind != "image" && kind != "video" && kind != "document" {
			return false
		}
		if !optionalBoundedString(file, "url", 12_000_000) || !optionalBoundedString(file, "name", 1024) || !optionalBoundedString(file, "extractedText", 100_000) {
			return false
		}
	}
	return true
}

func sessionToolsValid(session map[string]any) bool {
	value, exists := session["allowedTools"]
	if !exists {
		return true
	}
	tools, ok := value.([]any)
	if !ok || len(tools) > 50 {
		return false
	}
	for _, raw := range tools {
		text, ok := raw.(string)
		if !ok || text == "" || len(text) > 128 {
			return false
		}
	}
	return true
}

func storedThreadMillis(ctx context.Context, db *sql.DB, workspace, id string) (int64, bool, bool) {
	var raw string
	err := db.QueryRowContext(ctx, `
		SELECT "updatedAt" FROM "AssistantThread"
		WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, true
	}
	if err != nil {
		return 0, false, false
	}
	parsed, ok := threadMillis(raw)
	if !ok {
		return 0, false, false
	}
	return parsed, true, true
}

func threadMillis(raw string) (int64, bool) {
	raw = strings.TrimSpace(raw)
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05Z07:00",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UnixMilli(), true
		}
	}
	return 0, false
}
