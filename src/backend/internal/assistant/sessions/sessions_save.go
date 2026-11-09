package sessions

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/assistant"
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
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
	db, err := database.OpenRequired(cfg.SQLiteFile())
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

func sessionBatchError(payload map[string]any) string {
	sessions, _ := payload["sessions"].([]any)
	if len(sessions) > 50 {
		return "sessions 不能为空"
	}
	for _, raw := range sessions {
		session, ok := raw.(map[string]any)
		if !ok || !sessionShapeValid(session) {
			return "无效 JSON"
		}
	}
	if _, ok := sessionCurrentID(payload); !ok {
		return "无效 JSON"
	}
	return ""
}

func saveSessionBatch(ctx context.Context, db *sql.DB, workspace string, payload map[string]any) (int, any, error) {
	currentID, _ := sessionCurrentID(payload)
	sessions, _ := payload["sessions"].([]any)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, currentID, err
	}
	defer func() { _ = tx.Rollback() }()
	now := time.Now().UnixMilli()
	saved := 0
	for _, raw := range sessions {
		session := raw.(map[string]any)
		id := strings.TrimSpace(session["id"].(string))
		var messagesJSON string
		var updatedRaw string
		err := tx.QueryRowContext(ctx, `
			SELECT "messagesJson", "updatedAt" FROM "AssistantThread"
			WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&messagesJSON, &updatedRaw)
		if err != nil && err != sql.ErrNoRows {
			return 0, currentID, err
		}
		exists := err == nil
		if messagesJSON == assistant.DeletedThreadMessages {
			continue
		}
		updatedAt := now
		if value, ok := wholeMillis(session["updatedAt"]); ok {
			updatedAt = clampedMillis(value, now)
		}
		if exists {
			stored, ok := threadMillis(updatedRaw)
			if ok && stored > updatedAt {
				continue
			}
		}
		createdAt := updatedAt
		if value, ok := wholeMillis(session["createdAt"]); ok {
			createdAt = clampedMillis(value, now)
		}
		title, _ := session["title"].(string)
		title = strings.TrimSpace(title)
		if title == "" {
			title = "新对话"
		}
		merged, err := json.Marshal(mergeSessionMessages(messagesJSON, sessionMessages(session)))
		if err != nil {
			return 0, currentID, err
		}
		tools := sessionToolsJSON(session)
		stamp := time.UnixMilli(updatedAt).UTC().Format(time.RFC3339Nano)
		created := time.UnixMilli(createdAt).UTC().Format(time.RFC3339Nano)
		if exists {
			if tools == "" {
				_, err = tx.ExecContext(ctx, `
					UPDATE "AssistantThread" SET "title" = ?, "messagesJson" = ?, "updatedAt" = ?
					WHERE "id" = ? AND "workspaceId" = ?`, title, string(merged), stamp, id, workspace)
			} else {
				_, err = tx.ExecContext(ctx, `
					UPDATE "AssistantThread" SET "title" = ?, "messagesJson" = ?, "allowedToolsJson" = ?, "updatedAt" = ?
					WHERE "id" = ? AND "workspaceId" = ?`, title, string(merged), tools, stamp, id, workspace)
			}
		} else {
			if tools == "" {
				tools = "[]"
			}
			_, err = tx.ExecContext(ctx, `
				INSERT INTO "AssistantThread" ("id", "workspaceId", "title", "messagesJson", "allowedToolsJson", "createdAt", "updatedAt")
				VALUES (?, ?, ?, ?, ?, ?, ?)`, id, workspace, title, string(merged), tools, created, stamp)
		}
		if err != nil {
			return 0, currentID, err
		}
		saved++
	}
	if err := tx.Commit(); err != nil {
		return 0, currentID, err
	}
	return saved, currentID, nil
}

func sessionMessages(session map[string]any) []any {
	messages, _ := session["messages"].([]any)
	cleaned := make([]any, 0, len(messages))
	for _, raw := range messages {
		message, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		copy := map[string]any{}
		for key, value := range message {
			copy[key] = value
		}
		if files, ok := message["attachments"].([]any); ok {
			kept := []any{}
			for _, file := range files {
				if cleanedFile := sanitizeAttachment(file); cleanedFile != nil {
					kept = append(kept, cleanedFile)
				}
			}
			if len(kept) > 0 {
				copy["attachments"] = kept
			} else {
				delete(copy, "attachments")
			}
		}
		cleaned = append(cleaned, copy)
	}
	return cleaned
}

func sanitizeAttachment(value any) map[string]any {
	file, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	kind, _ := file["type"].(string)
	if kind != "video" && kind != "document" {
		kind = "image"
	}
	persistable := func(key string) string {
		text, _ := file[key].(string)
		if text == "" || strings.HasPrefix(text, "data:") || strings.HasPrefix(text, "blob:") {
			return ""
		}
		return text
	}
	if kind == "document" {
		text, _ := file["extractedText"].(string)
		name, _ := file["name"].(string)
		if text == "" && name == "" {
			return nil
		}
		if len(text) > 100000 {
			text = text[:100000]
		}
		return map[string]any{"type": "document", "name": name, "extractedText": text, "url": ""}
	}
	url := persistable("url")
	thumb := persistable("thumbnailUrl")
	if kind == "image" && url == "" {
		return nil
	}
	if kind == "video" && url == "" && thumb == "" {
		return nil
	}
	cleaned := map[string]any{"type": kind, "url": url}
	if thumb != "" {
		cleaned["thumbnailUrl"] = thumb
	}
	return cleaned
}

func sessionToolsJSON(session map[string]any) string {
	tools, exists := session["allowedTools"]
	if !exists {
		return ""
	}
	raw, err := json.Marshal(map[string]any{"version": 1, "tools": tools})
	if err != nil {
		return ""
	}
	return string(raw)
}

func mergeSessionMessages(previousJSON string, incoming []any) []any {
	var previous []any
	if json.Unmarshal([]byte(previousJSON), &previous) != nil {
		previous = nil
	}
	previousByKey := map[string]any{}
	order := []string{}
	for _, message := range previous {
		key := messageKey(message)
		if _, exists := previousByKey[key]; exists {
			continue
		}
		previousByKey[key] = message
		order = append(order, key)
	}
	incomingByKey := map[string]any{}
	incomingOrder := []string{}
	for _, message := range incoming {
		key := messageKey(message)
		incomingByKey[key] = message
		incomingOrder = append(incomingOrder, key)
	}
	additions := map[string][]any{}
	var nextExisting string
	hasNext := false
	for index := len(incomingOrder) - 1; index >= 0; index-- {
		key := incomingOrder[index]
		if _, exists := previousByKey[key]; exists {
			nextExisting = key
			hasNext = true
			continue
		}
		anchor := ""
		if hasNext {
			anchor = nextExisting
		}
		additions[anchor] = append(additions[anchor], incomingByKey[key])
	}
	merged := []any{}
	for _, key := range order {
		group := additions[key]
		for index := len(group) - 1; index >= 0; index-- {
			merged = append(merged, group[index])
		}
		if replacement, exists := incomingByKey[key]; exists {
			merged = append(merged, replacement)
		} else {
			merged = append(merged, previousByKey[key])
		}
	}
	group := additions[""]
	for index := len(group) - 1; index >= 0; index-- {
		merged = append(merged, group[index])
	}
	return merged
}

func messageKey(message any) string {
	if object, ok := message.(map[string]any); ok {
		if id, ok := object["id"].(string); ok && id != "" {
			return "id:" + id
		}
	}
	raw, err := json.Marshal(message)
	if err != nil {
		return ""
	}
	return string(raw)
}
