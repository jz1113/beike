package workshop

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

func DuplicateWorkshopBatch(ctx context.Context, db *sql.DB, workspace, id string) (WorkshopBatchRow, error) {
	source, err := GetWorkshopBatch(ctx, db, workspace, id)
	if err != nil || source.ID == "" {
		return WorkshopBatchRow{}, ErrBatchMissing
	}
	active, err := EnsureActiveWorkshopBatch(ctx, db, workspace)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	if source.ID == active.ID {
		source = active
	}
	return replaceActiveBatch(ctx, db, workspace, active, workshopBatchCopyName(source), duplicateSnapshot(source.Snapshot), false)
}

func ArchiveActiveWorkshopBatch(ctx context.Context, db *sql.DB, workspace string, force bool) (WorkshopBatchRow, error) {
	active, err := EnsureActiveWorkshopBatch(ctx, db, workspace)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	if active.Status != "completed" && active.Status != "cancelled" && !force {
		return WorkshopBatchRow{}, errors.New("请先完成本批次，或确认放弃后再归档")
	}
	return replaceActiveBatch(ctx, db, workspace, active, "未命名新批次", emptyBatchSnapshot(), true)
}

func replaceActiveBatch(ctx context.Context, db *sql.DB, workspace string, active WorkshopBatchRow, name, snapshot string, force bool) (WorkshopBatchRow, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	defer tx.Rollback()
	if err := retireActiveBatch(ctx, tx, workspace, active, force); err != nil {
		return WorkshopBatchRow{}, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	id := newBatchID()
	if err := insertBatchTx(ctx, tx, workspace, id, name, "draft", snapshot, now, false); err != nil {
		return WorkshopBatchRow{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE "WorkshopBatchState" SET "activeBatchId" = ? WHERE "workspaceId" = ? AND "activeBatchId" = ?`, id, workspace, active.ID)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	changed, _ := result.RowsAffected()
	if changed != 1 {
		return WorkshopBatchRow{}, errors.New("当前批次已在其他窗口切换，请重新加载后继续")
	}
	row, err := getBatchTx(ctx, tx, workspace, id)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	return row, tx.Commit()
}

func duplicateSnapshot(raw string) string {
	var snapshot map[string]any
	if json.Unmarshal([]byte(raw), &snapshot) != nil {
		snapshot = map[string]any{}
	}
	snapshot["currentStage"] = stageForBatchContent(snapshot)
	if items, _ := snapshot["items"].([]any); len(items) > 0 {
		snapshot["batchInputText"] = ""
	}
	snapshot["pipeline"] = map[string]any{
		"status": "draft", "planRevision": 0, "storyboardRevision": 0,
		"diversityContext": map[string]any{"groupSignatures": []any{}, "actionIds": []any{}, "sceneIds": []any{}},
		"runs":             []any{},
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return emptyBatchSnapshot()
	}
	return string(encoded)
}

func stageForBatchContent(snapshot map[string]any) int {
	items, _ := snapshot["items"].([]any)
	hasImages := false
	hasPrompts := false
	hasSuccess := false
	for _, item := range items {
		product, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if product["status"] == "success" {
			hasSuccess = true
		}
		if prompts, ok := product["prompts"].([]any); ok && len(prompts) > 0 {
			hasPrompts = true
		}
		tasks, _ := product["tasks"].([]any)
		for _, rawTask := range tasks {
			task, ok := rawTask.(map[string]any)
			if !ok {
				continue
			}
			url, _ := task["resultUrl"].(string)
			if task["status"] == "SUCCESS" && url != "" && len(url) >= 5 && url[:5] != "blob:" {
				hasImages = true
			}
		}
	}
	if hasImages {
		return 4
	}
	if hasPrompts {
		return 3
	}
	if hasSuccess {
		return 2
	}
	return 1
}
