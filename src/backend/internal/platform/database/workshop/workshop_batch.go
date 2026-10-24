package workshop

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

type WorkshopBatchRow struct {
	ID              string
	Name            string
	Status          string
	Revision        int
	Snapshot        string
	CreatedAt       string
	UpdatedAt       string
	LegacyRecovered bool
}

func ListWorkshopBatches(ctx context.Context, db *sql.DB, workspace string) ([]WorkshopBatchRow, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered"
		FROM "WorkshopBatch" WHERE "workspaceId" = ? ORDER BY "updatedAt" DESC`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBatches(rows)
}

func GetWorkshopBatch(ctx context.Context, db *sql.DB, workspace, id string) (WorkshopBatchRow, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "id", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered"
		FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" = ?`, workspace, id)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	defer rows.Close()
	list, err := scanBatches(rows)
	if err != nil || len(list) == 0 {
		return WorkshopBatchRow{}, err
	}
	return list[0], nil
}

func EnsureActiveWorkshopBatch(ctx context.Context, db *sql.DB, workspace string) (WorkshopBatchRow, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	defer tx.Rollback()
	var activeID, migrated sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT "activeBatchId", "legacyMigratedAt" FROM "WorkshopBatchState" WHERE "workspaceId" = ?`, workspace).Scan(&activeID, &migrated)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return WorkshopBatchRow{}, err
	}
	if activeID.Valid && activeID.String != "" {
		row, err := getBatchTx(ctx, tx, workspace, activeID.String)
		if err == nil && row.Status != "archived" {
			return row, tx.Commit()
		}
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if !migrated.Valid || migrated.String == "" {
		var legacy string
		err = tx.QueryRowContext(ctx, `SELECT "snapshotJson" FROM "WorkshopWorkspace" WHERE "workspaceId" = ? AND "id" = 'original'`, workspace).Scan(&legacy)
		if err == nil && snapshotHasContent(legacy) {
			if err := insertBatchTx(ctx, tx, workspace, newBatchID(), "恢复的历史批次", "archived", legacy, now, true); err != nil {
				return WorkshopBatchRow{}, err
			}
		}
	}
	id := newBatchID()
	if err := insertBatchTx(ctx, tx, workspace, id, "未命名新批次", "draft", emptyBatchSnapshot(), now, false); err != nil {
		return WorkshopBatchRow{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "WorkshopBatchState" ("id", "workspaceId", "activeBatchId", "legacyMigratedAt")
		VALUES (?, ?, ?, ?)
		ON CONFLICT("workspaceId") DO UPDATE SET "activeBatchId" = excluded."activeBatchId",
		"legacyMigratedAt" = COALESCE("WorkshopBatchState"."legacyMigratedAt", excluded."legacyMigratedAt")`,
		workspace, workspace, id, now); err != nil {
		return WorkshopBatchRow{}, err
	}
	row, err := getBatchTx(ctx, tx, workspace, id)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	return row, tx.Commit()
}

func insertBatchTx(ctx context.Context, tx *sql.Tx, workspace, id, name, status, snapshot, now string, legacy bool) error {
	flag := 0
	if legacy {
		flag = 1
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO "WorkshopBatch" ("id", "workspaceId", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
		VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`, id, workspace, name, status, snapshot, now, now, flag)
	return err
}

func getBatchTx(ctx context.Context, tx *sql.Tx, workspace, id string) (WorkshopBatchRow, error) {
	var row WorkshopBatchRow
	var legacy int
	err := tx.QueryRowContext(ctx, `
		SELECT "id", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered"
		FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(
		&row.ID, &row.Name, &row.Status, &row.Revision, &row.Snapshot, &row.CreatedAt, &row.UpdatedAt, &legacy)
	row.LegacyRecovered = legacy != 0
	return row, err
}

func scanBatches(rows *sql.Rows) ([]WorkshopBatchRow, error) {
	list := []WorkshopBatchRow{}
	for rows.Next() {
		var row WorkshopBatchRow
		var legacy int
		if err := rows.Scan(&row.ID, &row.Name, &row.Status, &row.Revision, &row.Snapshot, &row.CreatedAt, &row.UpdatedAt, &legacy); err != nil {
			return nil, err
		}
		row.LegacyRecovered = legacy != 0
		list = append(list, row)
	}
	return list, rows.Err()
}

func snapshotHasContent(raw string) bool {
	var snapshot map[string]any
	if json.Unmarshal([]byte(raw), &snapshot) != nil {
		return false
	}
	if text, _ := snapshot["batchInputText"].(string); len(text) > 0 {
		return true
	}
	items, _ := snapshot["items"].([]any)
	return len(items) > 0
}

func emptyBatchSnapshot() string {
	return `{"version":2,"mode":"original","currentStage":1,"batchInputText":"","items":[],"settings":{"selectedVisionModel":"gemini-3.7-flash","selectedImageGenModel":"gpt-image-2","selectedArchId":"auto","hasHumanPersona":true,"personaMode":"asset_driven","selectedQuality":"high","selectedAspect":"3:4","selectedShotCount":4,"useAssetLibrary":true,"lockedPersonaId":"auto","lockedSceneId":"auto","lockedOutfitId":"auto","lockedActionId":"auto","lockedFullPromptId":"auto","promptGroupFolderId":"auto","generationStrategy":"single_shot","autoGenerateCopywriting":true},"pipeline":{"status":"draft","planRevision":0,"storyboardRevision":0,"diversityContext":{"groupSignatures":[],"actionIds":[],"sceneIds":[]},"runs":[]}}`
}

var ErrBatchConflict = errors.New("批次冲突")
var ErrBatchMissing = errors.New("批次不存在或已删除")

func RenameWorkshopBatch(ctx context.Context, db *sql.DB, workspace, id, name string) (WorkshopBatchRow, error) {
	row, err := GetWorkshopBatch(ctx, db, workspace, id)
	if err != nil || row.ID == "" {
		return WorkshopBatchRow{}, ErrBatchMissing
	}
	updatedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := db.ExecContext(ctx, `UPDATE "WorkshopBatch" SET "name" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "id" = ?`, name, updatedAt, workspace, id); err != nil {
		return WorkshopBatchRow{}, err
	}
	return GetWorkshopBatch(ctx, db, workspace, id)
}

func DeleteWorkshopHistory(ctx context.Context, db *sql.DB, workspace, id string) (int64, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var active sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ?`, workspace).Scan(&active)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	if active.Valid && active.String == id {
		return 0, ErrBatchConflict
	}
	var found string
	err = tx.QueryRowContext(ctx, `SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" = ?`, workspace, id).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrBatchMissing
	}
	if err != nil {
		return 0, err
	}
	for _, statement := range []string{
		`DELETE FROM "WorkshopOutputReview" WHERE "workspaceId" = ? AND "batchId" = ?`,
		`DELETE FROM "WorkshopPipelineRun" WHERE "workspaceId" = ? AND "batchId" = ?`,
		`DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "batchId" = ?`,
	} {
		if _, err := tx.ExecContext(ctx, statement, workspace, id); err != nil {
			return 0, err
		}
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" = ?`, workspace, id)
	if err != nil {
		return 0, err
	}
	deleted, _ := result.RowsAffected()
	return deleted, tx.Commit()
}

func ClearWorkshopHistory(ctx context.Context, db *sql.DB, workspace, activeID string) (int64, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var current sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ?`, workspace).Scan(&current); err != nil {
		return 0, err
	}
	if !current.Valid || current.String != activeID {
		return 0, ErrBatchConflict
	}
	for _, statement := range []string{
		`DELETE FROM "WorkshopOutputReview" WHERE "workspaceId" = ? AND "batchId" <> ?`,
		`DELETE FROM "WorkshopPipelineRun" WHERE "workspaceId" = ? AND "batchId" <> ?`,
		`DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "batchId" IN (SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" <> ?)`,
	} {
		args := []any{workspace, activeID}
		if statement == `DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "batchId" IN (SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" <> ?)` {
			args = []any{workspace, workspace, activeID}
		}
		if _, err := tx.ExecContext(ctx, statement, args...); err != nil {
			return 0, err
		}
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" <> ?`, workspace, activeID)
	if err != nil {
		return 0, err
	}
	deleted, _ := result.RowsAffected()
	return deleted, tx.Commit()
}

func WriteWorkshopBatch(ctx context.Context, db *sql.DB, workspace, id string, revision int, snapshot, status string) (int, string, error) {
	active, err := EnsureActiveWorkshopBatch(ctx, db, workspace)
	if err != nil {
		return 0, "", err
	}
	if active.ID != id {
		return 0, "", errors.New("只能保存当前活跃批次，历史批次请复制为新批次后再编辑")
	}
	current, err := GetWorkshopBatch(ctx, db, workspace, id)
	if err != nil || current.ID == "" {
		return 0, "", ErrBatchMissing
	}
	if current.Status == "archived" {
		return 0, "", errors.New("历史批次为只读内容，请复制为新批次后再编辑")
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	result, err := db.ExecContext(ctx, `
		UPDATE "WorkshopBatch"
		SET "revision" = "revision" + 1, "status" = ?, "snapshotJson" = ?, "updatedAt" = ?
		WHERE "workspaceId" = ? AND "id" = ? AND "revision" = ? AND "status" <> 'archived'
		  AND "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ?)`,
		status, snapshot, now, workspace, id, revision, workspace)
	if err != nil {
		return 0, "", err
	}
	changed, _ := result.RowsAffected()
	if changed != 1 {
		return 0, "", errors.New("当前批次已在其他窗口更新，请重新加载后继续")
	}
	return revision + 1, now, nil
}

func CreateWorkshopBatch(ctx context.Context, db *sql.DB, workspace, name string, named bool) (WorkshopBatchRow, error) {
	active, err := EnsureActiveWorkshopBatch(ctx, db, workspace)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	defer tx.Rollback()
	if active.Status == "draft" && !snapshotHasContent(active.Snapshot) && !named {
		if err := tx.Commit(); err != nil {
			return WorkshopBatchRow{}, err
		}
		return active, nil
	}
	if err := retireActiveBatch(ctx, tx, workspace, active, false); err != nil {
		return WorkshopBatchRow{}, err
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	id := newBatchID()
	if name == "" {
		name = "未命名新批次"
	}
	if err := insertBatchTx(ctx, tx, workspace, id, name, "draft", emptyBatchWithPreferences(active.Snapshot), now, false); err != nil {
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

func retireActiveBatch(ctx context.Context, tx *sql.Tx, workspace string, active WorkshopBatchRow, force bool) error {
	if !force && active.Status == "draft" && !snapshotHasContent(active.Snapshot) {
		var found string
		err := tx.QueryRowContext(ctx, `
			SELECT "id" FROM "WorkshopBatch"
			WHERE "workspaceId" = ? AND "id" = ? AND "revision" = ? AND "status" <> 'archived'
			  AND "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ?)`,
			workspace, active.ID, active.Revision, workspace).Scan(&found)
		if err != nil {
			return errors.New("当前批次已在其他窗口更新或切换，请重新加载后再新建")
		}
		return nil
	}
	snapshot := archiveSnapshot(active.Snapshot)
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	result, err := tx.ExecContext(ctx, `
		UPDATE "WorkshopBatch"
		SET "revision" = "revision" + 1, "status" = 'archived', "snapshotJson" = ?, "updatedAt" = ?
		WHERE "workspaceId" = ? AND "id" = ? AND "revision" = ? AND "status" <> 'archived'
		  AND "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ?)`,
		snapshot, now, workspace, active.ID, active.Revision, workspace)
	if err != nil {
		return err
	}
	changed, _ := result.RowsAffected()
	if changed != 1 {
		return errors.New("当前批次已在其他窗口更新或切换，请重新加载后再归档")
	}
	return nil
}

func archiveSnapshot(raw string) string {
	var snapshot map[string]any
	if json.Unmarshal([]byte(raw), &snapshot) != nil {
		snapshot = map[string]any{}
	}
	snapshot["currentStage"] = 4
	pipeline, _ := snapshot["pipeline"].(map[string]any)
	if pipeline == nil {
		pipeline = map[string]any{}
	}
	pipeline["status"] = "archived"
	snapshot["pipeline"] = pipeline
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return raw
	}
	return string(encoded)
}

func newBatchID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "batch_local"
	}
	return "batch_" + hex.EncodeToString(buf[:])
}
