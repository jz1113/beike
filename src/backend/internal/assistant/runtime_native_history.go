package assistant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
)

// Only a completed, tool-free final native message is eligible for restoration.
// Tool-use blocks and their results remain an atomic sequence within a run; we
// never reconstruct a signed tool call from the browser's display history.
type nativeContinuation struct {
	Model     string `json:"model"`
	BaseURL   string `json:"baseUrl"`
	Protocol  string `json:"protocol"`
	RouteHash string `json:"routeHash"`
	Text      string `json:"text"`
	Content   any    `json:"content"`
}

func nativeRouteHash(creds gatewayCreds) string {
	sum := sha256.Sum256([]byte(normalizeBase(creds.baseURL) + "\x00" + creds.apiKey))
	return hex.EncodeToString(sum[:])
}

func saveNativeContinuation(ctx context.Context, cfg config.Config, workspace, turnID string, loop *agentLoop) {
	if len(loop.messages) == 0 {
		return
	}
	message := loop.messages[len(loop.messages)-1]
	text, _ := message["content"].(string)
	if message["role"] != "assistant" || message["native_content"] == nil || message["tool_calls"] != nil || strings.TrimSpace(text) == "" {
		return
	}
	model := loop.models[0]
	continuation := nativeContinuation{Model: model, BaseURL: normalizeBase(loop.creds.baseURL), Protocol: gateway.ResolveTextProtocol(model, loop.creds.protocol), RouteHash: nativeRouteHash(loop.creds), Text: text, Content: message["native_content"]}
	raw, err := json.Marshal(continuation)
	if err != nil || len(raw) > 2<<20 {
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	// The private value is stored separately from snapshots sent to the client.
	_, _ = db.ExecContext(ctx, `UPDATE "AssistantTurn" SET "snapshotJson" = json_set("snapshotJson", '$._nativeContinuation', json(?)) WHERE "id" = ? AND "workspaceId" = ? AND "status" = 'completed'`, string(raw), turnID, workspace)
}

func restoreNativeContinuations(ctx context.Context, cfg config.Config, workspace, threadID, model string, creds gatewayCreds, messages []map[string]any) {
	protocol := gateway.ResolveTextProtocol(model, creds.protocol)
	if protocol == "openai" {
		return
	}
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	rows, err := db.QueryContext(ctx, `SELECT json_extract("snapshotJson", '$._nativeContinuation') FROM "AssistantTurn" WHERE "workspaceId" = ? AND "threadId" = ? AND "status" = 'completed' AND json_extract("snapshotJson", '$._nativeContinuation') IS NOT NULL ORDER BY "startedAt" DESC LIMIT 20`, workspace, threadID)
	if err != nil {
		return
	}
	defer rows.Close()
	byText := map[string][]any{}
	for rows.Next() {
		var raw string
		var item nativeContinuation
		if rows.Scan(&raw) != nil || json.Unmarshal([]byte(raw), &item) != nil {
			continue
		}
		if item.Model == model && item.Protocol == protocol && item.BaseURL == normalizeBase(creds.baseURL) && item.RouteHash == nativeRouteHash(creds) {
			byText[item.Text] = append(byText[item.Text], item.Content)
		}
	}
	// Match newest occurrences first; identical visible replies must not all
	// receive the most recent signature or consume it more than once.
	for i := len(messages) - 1; i >= 0; i-- {
		message := messages[i]
		text, _ := message["content"].(string)
		if message["role"] == "assistant" {
			if native := byText[text]; len(native) > 0 {
				message["native_content"] = native[0]
				byText[text] = native[1:]
			}
		}
	}
}
