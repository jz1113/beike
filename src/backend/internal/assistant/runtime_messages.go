package assistant

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
)

func turnMessages(r *http.Request, threadID string, payload map[string]json.RawMessage) ([]map[string]any, []attachedDoc) {
	var raw []map[string]any
	_ = json.Unmarshal(payload["messages"], &raw)
	record, err := loadMemory(MemoryPath(r, threadID))
	if err != nil {
		record = emptyMemory()
	}
	raw = filterRemembered(raw, record)
	docs := []attachedDoc{}
	messages := []map[string]any{}
	if system := optionalString(payload, "systemPrompt"); system != "" {
		messages = append(messages, map[string]any{"role": "system", "content": system})
	}
	if record.Enabled && record.Summary != "" {
		messages = append(messages, map[string]any{"role": "system", "content": "会话记忆：" + record.Summary})
	}
	for _, message := range raw {
		role, _ := message["role"].(string)
		if role != "user" && role != "assistant" && role != "system" {
			continue
		}
		content, ok := message["content"]
		if !ok {
			continue
		}
		copied := map[string]any{"role": role, "content": content}
		if widget, ok := message["productWidget"]; ok {
			copied["productWidget"] = widget
		}
		messages = append(messages, copied)
		if role != "user" {
			continue
		}
		attachments, _ := message["attachments"].([]any)
		for _, rawAttachment := range attachments {
			attachment, _ := rawAttachment.(map[string]any)
			text, _ := attachment["extractedText"].(string)
			if text == "" {
				continue
			}
			name, _ := attachment["name"].(string)
			docs = append(docs, attachedDoc{Name: name, Text: text})
		}
	}
	return messages, docs
}

func filterRemembered(messages []map[string]any, record memoryRecord) []map[string]any {
	if !record.Enabled || record.Summary == "" {
		return messages
	}
	pending := map[string]bool{}
	for _, item := range record.Pending {
		id, _ := item["id"].(string)
		if id != "" {
			pending[id] = true
		}
	}
	covered := map[string]bool{}
	for _, key := range record.Seen {
		if !pending[key] {
			covered[key] = true
		}
	}
	latestUser := -1
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] == "user" {
			latestUser = i
			break
		}
	}
	kept := []map[string]any{}
	for i, message := range messages {
		attachments, _ := message["attachments"].([]any)
		key := messageMemoryKey(message)
		if i >= latestUser || len(attachments) > 0 || key == "" || !covered[key] {
			kept = append(kept, message)
		}
	}
	return kept
}

func messageMemoryKey(message map[string]any) string {
	content, ok := message["content"].(string)
	if !ok {
		return ""
	}
	id, _ := message["id"].(string)
	role, _ := message["role"].(string)
	body, err := json.Marshal([]any{id, role, content})
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
