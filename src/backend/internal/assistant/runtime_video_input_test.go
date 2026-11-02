package assistant

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestVideoTurnAnalyzesNativeMediaWithoutLoadingSkills(t *testing.T) {
	defer FlushTelemetry()
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	dir := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", dir)
	video := append([]byte{0x1a, 0x45, 0xdf, 0xa3}, []byte("video fixture")...)
	path := filepath.Join(dir, "local", "assistant-attachments", "input.webm")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, video, 0o600); err != nil {
		t.Fatal(err)
	}
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		encoded, _ := json.Marshal(body)
		if body["tools"] != nil || body["toolConfig"] != nil || strings.Contains(string(encoded), "read_skill") {
			t.Error("ordinary video analysis must not load skills or offer agent tools")
		}
		if !strings.Contains(string(encoded), base64.StdEncoding.EncodeToString(video)) || !strings.Contains(string(encoded), `"mimeType":"video/webm"`) {
			t.Error("first model request did not contain the actual video")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"直接视频分析结果\"}]},\"finishReason\":\"STOP\"}]}\n\n")
	}))
	defer upstream.Close()
	dbPath := filepath.Join(t.TempDir(), "video.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, schema := range []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, workspaceId TEXT, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, completedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
	} {
		if _, err := db.Exec(schema); err != nil {
			t.Fatal(err)
		}
	}
	_ = db.Close()
	cfg := config.Config{DatabaseURL: "file:" + dbPath}
	for _, followup := range []bool{false, true} {
		messages := []map[string]any{{"role": "user", "content": "分析视频，写出逐镜生成提示词", "attachments": []map[string]any{{"type": "video", "url": "/storage/local/assistant-attachments/input.webm", "name": "参考视频"}}}}
		if followup {
			messages = append(messages, map[string]any{"role": "assistant", "content": "第一轮分析"}, map[string]any{"role": "user", "content": "继续细化最后一镜"})
		}
		body, _ := json.Marshal(map[string]any{
			"threadId": "video-thread", "model": "gemini-3.8-flash", "textProtocol": "gemini", "customBaseUrl": upstream.URL, "customApiKey": "test-key",
			"messages":     messages,
			"skillCatalog": []map[string]any{{"id": "video-teardown", "name": "拆解视频", "prompt": "先读取技能"}},
			"mcpServers":   []any{map[string]any{"url": "http://127.0.0.1:1/must-not-connect"}},
		})
		response := httptest.NewRecorder()
		StartTurn(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(string(body))))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "直接视频分析结果") || !strings.Contains(response.Body.String(), "turn/completed") || strings.Contains(response.Body.String(), `"type":"item/toolCall/started"`) {
			t.Fatalf("direct video turn: %d %s", response.Code, response.Body.String())
		}
	}
	if requests != 2 {
		t.Fatalf("each analysis should make one model request, got %d", requests)
	}
}
