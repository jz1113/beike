package assistant

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type claimResult struct {
	outcome  string
	threadID string
	status   string
	snapshot string
}

func requestFingerprint(payload map[string]json.RawMessage, baseURL, apiKey string) string {
	var input any
	body, _ := json.Marshal(payload)
	_ = json.Unmarshal(body, &input)
	object, _ := input.(map[string]any)
	if object == nil {
		object = map[string]any{}
	}
	delete(object, "turnId")
	delete(object, "customApiKey")
	sum := sha256.Sum256([]byte(canonicalJSON(map[string]any{"input": object, "credentials": map[string]any{"baseUrl": baseURL, "apiKey": apiKey}})))
	return hex.EncodeToString(sum[:])
}

func canonicalJSON(value any) string {
	body, _ := json.Marshal(stableValue(value))
	return string(body)
}

func claimTurn(ctx context.Context, cfg config.Config, workspace, turnID, threadID, fingerprint, model string) (claimResult, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return claimResult{}, err
	}
	defer db.Close()
	gone, err := threadGone(ctx, db, threadID)
	if err != nil {
		return claimResult{}, err
	}
	if gone {
		return claimResult{outcome: "deleted"}, nil
	}
	metadata, _ := json.Marshal(map[string]any{"_execution": map[string]any{"version": 1, "fingerprint": fingerprint}})
	stamp := time.Now().UTC().Format(time.RFC3339Nano)
	result, err := db.ExecContext(ctx, `
		INSERT INTO "AssistantTurn" ("id", "workspaceId", "threadId", "model", "status", "startedAt", "snapshotJson")
		VALUES (?, ?, ?, ?, 'running', ?, ?)
		ON CONFLICT("id") DO NOTHING`, turnID, workspace, threadID, model, stamp, string(metadata))
	if err != nil {
		return claimResult{}, err
	}
	inserted, _ := result.RowsAffected()
	if inserted == 1 {
		return claimResult{outcome: "claimed"}, nil
	}
	var stored claimResult
	err = db.QueryRowContext(ctx, `
		SELECT "threadId", "status", "snapshotJson" FROM "AssistantTurn"
		WHERE "id" = ? AND "workspaceId" = ?`, turnID, workspace).Scan(&stored.threadID, &stored.status, &stored.snapshot)
	if err == sql.ErrNoRows {
		return claimResult{outcome: "conflict"}, nil
	}
	if err != nil {
		return claimResult{}, err
	}
	var saved map[string]any
	_ = json.Unmarshal([]byte(stored.snapshot), &saved)
	execution, _ := saved["_execution"].(map[string]any)
	savedFingerprint, _ := execution["fingerprint"].(string)
	if stored.threadID != threadID || (execution != nil && savedFingerprint != fingerprint) {
		return claimResult{outcome: "conflict"}, nil
	}
	stored.outcome = "existing"
	return stored, nil
}

func threadGone(ctx context.Context, db *sql.DB, threadID string) (bool, error) {
	var messages string
	err := db.QueryRowContext(ctx, `SELECT "messagesJson" FROM "AssistantThread" WHERE "id" = ?`, threadID).Scan(&messages)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return messages == deletedThreadMessages, nil
}

func saveTurnState(ctx context.Context, cfg config.Config, workspace, turnID, status, model string, usageIn, usageOut int, snapshot map[string]any) error {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	var current string
	if err := db.QueryRowContext(ctx, `SELECT "snapshotJson" FROM "AssistantTurn" WHERE "id" = ? AND "workspaceId" = ?`, turnID, workspace).Scan(&current); err != nil {
		return err
	}
	var previous map[string]any
	_ = json.Unmarshal([]byte(current), &previous)
	if snapshot == nil {
		snapshot = map[string]any{}
	}
	if execution, ok := previous["_execution"]; ok {
		snapshot["_execution"] = execution
	}
	body, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	completed := any(nil)
	if status == "completed" || status == "failed" || status == "interrupted" {
		completed = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, err = db.ExecContext(ctx, `
		UPDATE "AssistantTurn" SET "status" = ?, "completedAt" = ?, "usageInputTokens" = ?, "usageOutputTokens" = ?, "model" = ?, "snapshotJson" = ?
		WHERE "id" = ? AND "workspaceId" = ?`, status, completed, usageIn, usageOut, model, string(body), turnID, workspace)
	return err
}

func upsertTurnItem(ctx context.Context, cfg config.Config, workspace, turnID string, item map[string]any) error {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	fields := itemFields(item)
	stamp := time.Now().UTC().Format(time.RFC3339Nano)
	if started, ok := item["createdAt"].(int64); ok && started > 0 {
		stamp = time.UnixMilli(started).UTC().Format(time.RFC3339Nano)
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO "AssistantTurnItem"
		("id", "workspaceId", "turnId", "kind", "status", "startedAt", "content", "reasoning", "toolName", "displayName", "argsJson", "summary", "actionJson", "visualImagesJson", "metaJson")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT("id") DO UPDATE SET
		"status" = excluded."status", "content" = excluded."content", "reasoning" = excluded."reasoning",
		"toolName" = excluded."toolName", "displayName" = excluded."displayName", "argsJson" = excluded."argsJson",
		"summary" = excluded."summary", "actionJson" = excluded."actionJson", "visualImagesJson" = excluded."visualImagesJson", "metaJson" = excluded."metaJson"`,
		fields.id, workspace, turnID, fields.kind, fields.status, stamp, fields.content, fields.reasoning, nullString(fields.toolName), nullString(fields.displayName), fields.args, nullString(fields.summary), nullString(fields.action), nullString(fields.visual), fields.meta)
	return err
}

type itemColumns struct {
	id, kind, status, content, reasoning, toolName, displayName, args, summary, action, visual, meta string
}

func itemFields(item map[string]any) itemColumns {
	kind, _ := item["kind"].(string)
	fields := itemColumns{id: textField(item, "id"), kind: kind, status: "done", args: "{}", meta: "{}"}
	switch kind {
	case "agentMessage":
		fields.content = textField(item, "content")
	case "agentReasoning":
		fields.reasoning = textField(item, "content")
	case "toolCall":
		fields.toolName = textField(item, "name")
		fields.displayName = textField(item, "displayName")
		fields.args = textField(item, "args")
		if fields.args == "" {
			fields.args = "{}"
		}
		meta, _ := json.Marshal(map[string]any{"callId": textField(item, "callId")})
		fields.meta = string(meta)
		fields.status = textField(item, "status")
		if fields.status != "done" && fields.status != "error" {
			fields.status = "running"
		}
	case "approvalRequest":
		fields.toolName = textField(item, "toolName")
		fields.displayName = textField(item, "displayName")
		args, _ := json.Marshal(item["args"])
		fields.args = string(args)
		meta, _ := json.Marshal(map[string]any{"approvalId": textField(item, "approvalId"), "decision": item["decision"]})
		fields.meta = string(meta)
		switch textField(item, "status") {
		case "accepted":
			fields.status = "done"
		case "declined":
			fields.status = "error"
		case "expired":
			fields.status = "cancelled"
		default:
			fields.status = "running"
		}
	default:
		fields.content = textField(item, "content")
		fields.summary = textField(item, "summary")
	}
	return fields
}

func textField(item map[string]any, key string) string {
	text, _ := item[key].(string)
	return text
}

func nullString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func listThreadTurnRows(ctx context.Context, cfg config.Config, workspace, threadID, status string) ([]map[string]any, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	query := `SELECT "id", "status", "model", "startedAt", "completedAt", "usageInputTokens", "usageOutputTokens" FROM "AssistantTurn" WHERE "threadId" = ? AND "workspaceId" = ?`
	args := []any{threadID, workspace}
	visible := map[string]bool{"running": true, "completed": true, "interrupted": true, "failed": true, "awaiting_approval": true}
	if visible[status] && status != "interrupted" {
		query += ` AND "status" = ?`
		args = append(args, status)
	}
	if status == "interrupted" {
		query += ` AND "status" IN ('interrupted', 'running', 'awaiting_approval')`
	}
	query += ` ORDER BY "startedAt" DESC LIMIT 50`
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		item, err := scanTurnSummary(rows)
		if err != nil {
			return nil, err
		}
		item["status"] = effectiveTurnStatus(workspace, item["id"].(string), item["status"].(string))
		if visible[status] && item["status"] != status {
			continue
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func scanTurnSummary(rows *sql.Rows) (map[string]any, error) {
	var id, status, started string
	var model, completed sql.NullString
	var input, output sql.NullInt64
	if err := rows.Scan(&id, &status, &model, &started, &completed, &input, &output); err != nil {
		return nil, err
	}
	var completedAt any
	if completed.Valid {
		completedAt = threadTime(completed.String)
	}
	return map[string]any{
		"id": id, "status": status, "model": nullText(model), "startedAt": threadTime(started), "completedAt": completedAt,
		"usage": map[string]any{"inputTokens": nullInt(input), "outputTokens": nullInt(output)},
	}, nil
}

func nullText(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func nullInt(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}
