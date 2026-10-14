package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

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
		if messagesJSON == deletedThreadMessages {
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
