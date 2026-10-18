package assistant

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

const (
	maxInlineImages     = 4
	maxInlineImageBytes = 6_000_000
	maxInlineDataURL    = 8_000_000
)

const imageAttachedNote = "用户已经在本轮消息里附上图片。直接根据画面作答，不要要求重新上传。只有用户明确要求反推引擎或写入资产库时才调用 deconstruct_image。"

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
	latestUser := -1
	for i := len(raw) - 1; i >= 0; i-- {
		if raw[i]["role"] == "user" {
			latestUser = i
			break
		}
	}
	imageCount := 0
	for index, message := range raw {
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
		if role == "user" && index == latestUser {
			imageCount = inlineUserImages(copied, message["attachments"])
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
	if imageCount > 0 {
		messages = append(messages, map[string]any{"role": "system", "content": imageAttachedNote})
	}
	return messages, docs
}

func inlineUserImages(message map[string]any, rawAttachments any) int {
	attachments, _ := rawAttachments.([]any)
	images := []any{}
	for _, raw := range attachments {
		if len(images) >= maxInlineImages {
			break
		}
		attachment, _ := raw.(map[string]any)
		kind, _ := attachment["type"].(string)
		if kind != "image" {
			continue
		}
		url, _ := attachment["url"].(string)
		resolved, ok := resolveInlineImage(url)
		if !ok {
			continue
		}
		images = append(images, map[string]any{"type": "image_url", "image_url": map[string]any{"url": resolved}})
	}
	if len(images) == 0 {
		return 0
	}
	text, _ := message["content"].(string)
	if strings.TrimSpace(text) == "" {
		text = "请根据附图作答。"
	}
	parts := []any{map[string]any{"type": "text", "text": text}}
	message["content"] = append(parts, images...)
	return len(images)
}

func resolveInlineImage(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	switch {
	case raw == "":
		return "", false
	case strings.HasPrefix(raw, "data:image/"):
		if len(raw) > maxInlineDataURL {
			return "", false
		}
		return raw, true
	case strings.HasPrefix(raw, "https://"), strings.HasPrefix(raw, "http://"):
		return raw, true
	case strings.HasPrefix(raw, "/storage/"):
		return storageImageDataURL(raw)
	default:
		return "", false
	}
}

func storageImageDataURL(raw string) (string, bool) {
	rel := strings.TrimPrefix(raw, "/storage/")
	if idx := strings.IndexAny(rel, "?#"); idx >= 0 {
		rel = rel[:idx]
	}
	path := storage.StoredFile(rel)
	if path == "" {
		path = storage.SafeWithin(storage.ResolveRoot(), rel)
	}
	if path == "" {
		return "", false
	}
	body, err := os.ReadFile(path)
	if err != nil || len(body) == 0 || len(body) > maxInlineImageBytes {
		return "", false
	}
	mime := http.DetectContentType(body)
	if !strings.HasPrefix(mime, "image/") {
		return "", false
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(body), true
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
