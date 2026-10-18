package assistant

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestTurnMessagesInlineLatestImagesOnly(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", dir)
	rel := "local/assistant-attachments/sample.jpg"
	path := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte{0xff, 0xd8, 0xff, 0xd9}, 0o600); err != nil {
		t.Fatal(err)
	}

	body, err := json.Marshal([]map[string]any{
		{"role": "user", "content": "上一轮", "attachments": []map[string]any{{"type": "image", "url": "data:image/png;base64,aGk="}}},
		{"role": "assistant", "content": "好的"},
		{"role": "user", "content": "帮我反推生成这张图片的绘图提示词", "attachments": []map[string]any{
			{"type": "image", "url": ""},
			{"type": "document", "url": "data:image/png;base64,aGk="},
			{"type": "image", "url": "data:image/png;base64,aGk="},
			{"type": "image", "url": "/storage/" + rel},
			{"type": "image", "url": "data:image/png;base64,QQ=="},
			{"type": "image", "url": "data:image/png;base64,Qg=="},
			{"type": "image", "url": "data:image/png;base64,Qw=="},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	payload := map[string]json.RawMessage{"messages": body}
	messages, _ := turnMessages(httptest.NewRequest("POST", "/", nil), "thread-images", payload)

	var history, current map[string]any
	note := ""
	for _, message := range messages {
		role, _ := message["role"].(string)
		switch role {
		case "user":
			if _, ok := message["content"].(string); ok {
				history = message
			} else {
				current = message
			}
		case "system":
			if text, _ := message["content"].(string); text == imageAttachedNote {
				note = text
			}
		}
	}
	if history == nil || history["content"] != "上一轮" {
		t.Fatalf("history kept text, got %#v", history)
	}
	parts, _ := current["content"].([]any)
	if len(parts) != 5 {
		t.Fatalf("text plus 4 images, got %#v", current["content"])
	}
	first, _ := parts[0].(map[string]any)
	if first["text"] != "帮我反推生成这张图片的绘图提示词" {
		t.Fatalf("prompt text %#v", first)
	}
	image, _ := parts[1].(map[string]any)
	nested, _ := image["image_url"].(map[string]any)
	if image["type"] != "image_url" || nested["url"] != "data:image/png;base64,aGk=" {
		t.Fatalf("first image %#v", image)
	}
	stored, _ := parts[2].(map[string]any)
	storedURL, _ := stored["image_url"].(map[string]any)
	url, _ := storedURL["url"].(string)
	if len(url) < 20 || url[:5] != "data:" {
		t.Fatalf("storage image %#v", stored)
	}
	if note != imageAttachedNote {
		t.Fatalf("note %q", note)
	}
}
