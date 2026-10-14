package assistant

import (
	"context"
	"database/sql"
	"encoding/json"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

func readTurnSnapshot(ctx context.Context, cfg config.Config, workspace, turnID string) (map[string]any, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var threadID, status, snapshotJSON, started string
	var model, completed sql.NullString
	var input, output sql.NullInt64
	err = db.QueryRowContext(ctx, `
		SELECT "threadId", "status", "model", "startedAt", "completedAt", "usageInputTokens", "usageOutputTokens", "snapshotJson"
		FROM "AssistantTurn" WHERE "id" = ? AND "workspaceId" = ?`, turnID, workspace).Scan(&threadID, &status, &model, &started, &completed, &input, &output, &snapshotJSON)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	gone, err := threadGone(ctx, db, threadID)
	if err != nil || gone {
		return nil, err
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "kind", "status", "startedAt", "content", "reasoning", "toolName", "displayName", "argsJson", "summary", "actionJson", "visualImagesJson", "metaJson"
		FROM "AssistantTurnItem" WHERE "turnId" = ? AND "workspaceId" = ? ORDER BY "startedAt" ASC`, turnID, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		item, err := scanSnapshotItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	effective := effectiveTurnStatus(workspace, turnID, status)
	orphaned := (status == "running" || status == "awaiting_approval") && effective == "interrupted"
	if orphaned {
		items = markOrphaned(items)
	}
	var stored map[string]any
	_ = json.Unmarshal([]byte(snapshotJSON), &stored)
	task := normalizeTask(stored["task"])
	if task != nil {
		if taskStatus, _ := task["status"].(string); taskStatus == "running" && (effective == "completed" || effective == "failed" || effective == "interrupted") {
			mapped := "failed"
			if effective == "completed" {
				mapped = "completed"
			}
			if effective == "interrupted" {
				mapped = "cancelled"
			}
			task["status"] = mapped
		}
		if orphaned && task["status"] == "running" {
			task["status"] = "cancelled"
			task["stage"] = "执行连接已结束，已有结果已保留"
		}
	}
	gone, err = threadGone(ctx, db, threadID)
	if err != nil || gone {
		return nil, err
	}
	snapshot := map[string]any{
		"id": turnID, "threadId": threadID, "status": effective, "items": items,
		"usage": map[string]any{"inputTokens": zeroInt(input), "outputTokens": zeroInt(output)},
	}
	if model.Valid {
		snapshot["modelUsed"] = model.String
	}
	if task != nil {
		snapshot["task"] = task
	}
	return snapshot, nil
}

func scanSnapshotItem(rows *sql.Rows) (map[string]any, error) {
	var id, kind, status, started, content, reasoning, args string
	var toolName, displayName, summary, action, visual, meta sql.NullString
	if err := rows.Scan(&id, &kind, &status, &started, &content, &reasoning, &toolName, &displayName, &args, &summary, &action, &visual, &meta); err != nil {
		return nil, err
	}
	base := map[string]any{"id": id, "kind": kind, "createdAt": ThreadTime(started)}
	metaMap := map[string]any{}
	if meta.Valid {
		_ = json.Unmarshal([]byte(meta.String), &metaMap)
	}
	switch kind {
	case "agentMessage":
		base["content"] = content
	case "agentReasoning":
		base["content"] = reasoning
	case "toolCall":
		callID, _ := metaMap["callId"].(string)
		if callID == "" {
			callID = id
		}
		toolStatus := "running"
		if status == "done" || status == "error" {
			toolStatus = status
		}
		base["name"] = toolName.String
		base["displayName"] = firstText(displayName.String, toolName.String)
		base["args"] = args
		base["callId"] = callID
		base["status"] = toolStatus
	case "approvalRequest":
		approvalID, _ := metaMap["approvalId"].(string)
		if approvalID == "" {
			approvalID = id
		}
		approvalStatus := "pending"
		switch status {
		case "done":
			approvalStatus = "accepted"
		case "cancelled":
			approvalStatus = "expired"
		case "error":
			approvalStatus = "declined"
		}
		argsMap := map[string]any{}
		_ = json.Unmarshal([]byte(args), &argsMap)
		base["approvalId"] = approvalID
		base["toolName"] = toolName.String
		base["displayName"] = firstText(displayName.String, toolName.String)
		base["args"] = argsMap
		base["status"] = approvalStatus
		if decision, _ := metaMap["decision"].(string); decision != "" {
			base["decision"] = decision
		}
	default:
		base["content"] = content
	}
	return base, nil
}

func markOrphaned(items []any) []any {
	for _, raw := range items {
		item, _ := raw.(map[string]any)
		switch item["kind"] {
		case "toolCall":
			if item["status"] == "running" {
				item["status"] = "error"
			}
		case "approvalRequest":
			if item["status"] == "pending" {
				item["status"] = "expired"
				item["decision"] = "cancel"
			}
		}
	}
	return items
}

func normalizeTask(value any) map[string]any {
	task, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	mode, _ := task["mode"].(string)
	if mode != "plan" && mode != "act" {
		return nil
	}
	return task
}

func firstText(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func zeroInt(value sql.NullInt64) int64 {
	if !value.Valid {
		return 0
	}
	return value.Int64
}

func listRunRows(ctx context.Context, cfg config.Config, workspace, threadID string, includeCompleted bool, limit int) ([]map[string]any, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	query := `SELECT "id", "threadId", "status", "model", "startedAt", "completedAt", "usageInputTokens", "usageOutputTokens" FROM "AssistantTurn" WHERE "workspaceId" = ?`
	args := []any{workspace}
	if threadID != "" {
		query += ` AND "threadId" = ?`
		args = append(args, threadID)
	}
	if !includeCompleted {
		query += ` AND "status" IN ('running', 'awaiting_approval')`
	}
	if limit < 1 {
		limit = 20
	}
	if threadID != "" {
		limit = 20
	}
	query += ` ORDER BY "startedAt" DESC LIMIT ?`
	args = append(args, limit)
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, owner, status, started string
		var model, completed sql.NullString
		var input, output sql.NullInt64
		if err := rows.Scan(&id, &owner, &status, &model, &started, &completed, &input, &output); err != nil {
			return nil, err
		}
		gone, err := threadGone(ctx, db, owner)
		if err != nil {
			return nil, err
		}
		if gone {
			continue
		}
		effective := effectiveTurnStatus(workspace, id, status)
		if !includeCompleted && effective != "running" && effective != "awaiting_approval" {
			continue
		}
		var completedAt any
		if completed.Valid {
			completedAt = ThreadTime(completed.String)
		}
		run := map[string]any{
			"turnId": id, "threadId": owner, "status": effective, "model": nullText(model),
			"startedAt": ThreadTime(started), "completedAt": completedAt,
			"usage": map[string]any{"inputTokens": nullInt(input), "outputTokens": nullInt(output)},
		}
		if threadID == "" {
			var count int
			var last sql.NullString
			_ = db.QueryRowContext(ctx, `SELECT COUNT(*), MAX("startedAt") FROM "AssistantTurnItem" WHERE "turnId" = ?`, id).Scan(&count, &last)
			lastAt := ThreadTime(started)
			if last.Valid {
				lastAt = ThreadTime(last.String)
			}
			run["lastItemAt"] = lastAt
			run["itemCount"] = count
		}
		out = append(out, run)
	}
	return out, rows.Err()
}
