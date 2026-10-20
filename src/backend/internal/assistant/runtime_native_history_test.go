package assistant

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestNativeContinuationPersistsPrivatelyAndIsolatesRoutes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "continuation.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, sql := range []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
		`INSERT INTO AssistantTurn VALUES ('turn', 'space', 'thread', 'claude-haiku-5-5', 'completed', '2026-10-20', NULL, 1, 2, '{}')`,
	} {
		if _, err = db.Exec(sql); err != nil {
			t.Fatal(err)
		}
	}
	cfg := config.Config{DatabaseURL: "file:" + path}
	creds := gatewayCreds{baseURL: "https://relay.example", apiKey: "test-key", protocol: "anthropic"}
	loop := &agentLoop{creds: creds, models: []string{"claude-haiku-5-5"}}
	loop.pushAssistant(modelRound{content: "相同的最终正文", native: map[string]any{
		"protocol": "anthropic", "model": "claude-haiku-5-5", "content": []any{
			map[string]any{"type": "thinking", "thinking": "summary", "signature": "private-native-signature"},
			map[string]any{"type": "text", "text": "相同的最终正文"},
		},
	}})
	ctx := context.Background()
	saveNativeContinuation(ctx, cfg, "space", "turn", loop)
	for _, tc := range []struct {
		space, thread, model string
		creds                gatewayCreds
		want                 bool
	}{
		{"space", "thread", "claude-haiku-5-5", creds, true},
		{"other", "thread", "claude-haiku-5-5", creds, false},
		{"space", "other", "claude-haiku-5-5", creds, false},
		{"space", "thread", "claude-sonnet-5", creds, false},
		{"space", "thread", "claude-haiku-5-5", gatewayCreds{baseURL: creds.baseURL, apiKey: "other", protocol: creds.protocol}, false},
		{"space", "thread", "claude-haiku-5-5", gatewayCreds{baseURL: "https://other.example", apiKey: creds.apiKey, protocol: creds.protocol}, false},
		{"space", "thread", "claude-haiku-5-5", gatewayCreds{baseURL: creds.baseURL, apiKey: creds.apiKey, protocol: "openai"}, false},
	} {
		messages := []map[string]any{{"role": "assistant", "content": "相同的最终正文"}}
		restoreNativeContinuations(ctx, cfg, tc.space, tc.thread, tc.model, tc.creds, messages)
		if (messages[0]["native_content"] != nil) != tc.want {
			t.Fatalf("route isolation: %+v", tc)
		}
	}
	repeated := []map[string]any{{"role": "assistant", "content": "相同的最终正文"}, {"role": "assistant", "content": "相同的最终正文"}}
	restoreNativeContinuations(ctx, cfg, "space", "thread", "claude-haiku-5-5", creds, repeated)
	if repeated[0]["native_content"] != nil || repeated[1]["native_content"] == nil {
		t.Fatal("a saved signature was reused for duplicate visible replies")
	}
	snapshot, err := readTurnSnapshot(ctx, cfg, "space", "turn")
	if err != nil {
		t.Fatal(err)
	}
	wire, _ := json.Marshal(snapshot)
	if strings.Contains(string(wire), "private-native-signature") || strings.Contains(string(wire), "_nativeContinuation") {
		t.Fatal("private continuation leaked in public snapshot")
	}
}
