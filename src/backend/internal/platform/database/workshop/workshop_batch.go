package workshop

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
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
	name = workshopBatchName(id, name, now)
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
	return `{"version":2,"mode":"original","currentStage":1,"batchInputText":"","items":[],"settings":{"selectedVisionModel":"gemini-3.7-flash","selectedImageGenModel":"gpt-image-2","selectedArchId":"auto","hasHumanPersona":true,"personaMode":"asset_driven","selectedQuality":"high","selectedAspect":"3:4","selectedShotCount":4,"useAssetLibrary":true,"lockedPersonaId":"auto","lockedSceneId":"auto","lockedOutfitId":"auto","lockedActionId":"auto","lockedFullPromptId":"auto","promptGroupFolderId":"auto","generationStrategy":"grid_first","autoGenerateCopywriting":true},"pipeline":{"status":"draft","planRevision":0,"storyboardRevision":0,"diversityContext":{"groupSignatures":[],"actionIds":[],"sceneIds":[]},"runs":[]}}`
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
		`DELETE FROM "WorkshopOutputReview" WHERE "workspaceId" = ? AND "batchId" <> ? AND substr("batchId", 1, 7) <> 'canvas_'`,
		`DELETE FROM "WorkshopPipelineRun" WHERE "workspaceId" = ? AND "batchId" <> ? AND substr("batchId", 1, 7) <> 'canvas_'`,
		`DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "batchId" IN (SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" <> ? AND substr("id", 1, 7) <> 'canvas_')`,
	} {
		args := []any{workspace, activeID}
		if statement == `DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ? AND "batchId" IN (SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" <> ? AND substr("id", 1, 7) <> 'canvas_')` {
			args = []any{workspace, workspace, activeID}
		}
		if _, err := tx.ExecContext(ctx, statement, args...); err != nil {
			return 0, err
		}
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM "WorkshopBatch" WHERE "workspaceId" = ? AND "id" <> ? AND substr("id", 1, 7) <> 'canvas_'`, workspace, activeID)
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
	if active.ID != id && !IsCanvasWorkshopBatch(id) {
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
		  AND (? OR "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ?))`,
		status, snapshot, now, workspace, id, revision, IsCanvasWorkshopBatch(id), workspace)
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

func workshopBatchName(id, name, createdAt string) string {
	if name != "" && name != "未命名新批次" && name != "未命名批次" {
		return name
	}
	date, err := time.Parse(time.RFC3339Nano, createdAt)
	dateLabel := "未知日期"
	if err == nil {
		dateLabel = date.In(time.FixedZone("CST", 8*60*60)).Format("20060102")
	}
	shortID := id
	if len(shortID) > 6 {
		shortID = shortID[len(shortID)-6:]
	}
	return "电商图片 · " + dateLabel + " · " + strings.ToUpper(shortID)
}

func workshopBatchCopyName(source WorkshopBatchRow) string {
	name := strings.TrimSuffix(workshopBatchName(source.ID, source.Name, source.CreatedAt), "（副本）")
	characters := []rune(name)
	if len(characters) > 116 {
		name = string(characters[:116])
	}
	return name + "（副本）"
}

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

func IsCanvasWorkshopBatch(id string) bool { return strings.HasPrefix(id, "canvas_") }

// A canvas owns a stable, independent batch. Creating or copying it never retires
// the legacy active draft, and retrying the same project never copies twice.
func CreateCanvasWorkshopBatch(ctx context.Context, db *sql.DB, workspace, projectID, sourceID, name string) (WorkshopBatchRow, error) {
	digest := sha256.Sum256([]byte(workspace + "\x00" + projectID))
	id := "canvas_" + hex.EncodeToString(digest[:16])
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	defer tx.Rollback()
	existing, err := getBatchTx(ctx, tx, workspace, id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return WorkshopBatchRow{}, err
	}
	if existing.ID != "" {
		return existing, tx.Commit()
	}
	snapshot := emptyBatchSnapshot()
	if sourceID != "" {
		source, err := getBatchTx(ctx, tx, workspace, sourceID)
		if err != nil || source.ID == "" {
			return WorkshopBatchRow{}, ErrBatchMissing
		}
		snapshot = duplicateSnapshot(source.Snapshot)
		if name == "" {
			name = workshopBatchCopyName(source)
		}
	}
	if name == "" {
		name = "电商图文画布"
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if err := insertBatchTx(ctx, tx, workspace, id, name, "draft", snapshot, now, false); err != nil {
		return WorkshopBatchRow{}, err
	}
	row, err := getBatchTx(ctx, tx, workspace, id)
	if err != nil {
		return WorkshopBatchRow{}, err
	}
	return row, tx.Commit()
}

// Keep model and image preferences; each new batch starts with four-shot grid output.
func emptyBatchWithPreferences(previous string) string {
	var old, next map[string]any
	if json.Unmarshal([]byte(previous), &old) != nil {
		return emptyBatchSnapshot()
	}
	if json.Unmarshal([]byte(emptyBatchSnapshot()), &next) != nil {
		return emptyBatchSnapshot()
	}
	saved, _ := old["settings"].(map[string]any)
	settings := next["settings"].(map[string]any)
	for _, name := range []string{"selectedVisionModel", "selectedImageGenModel", "selectedQuality", "selectedAspect", "gridOutputSize"} {
		if value, exists := saved[name]; exists {
			settings[name] = value
		}
	}
	raw, _ := json.Marshal(next)
	return string(raw)
}

type ActiveWorkshopBatch struct {
	ID       string
	Snapshot string
	Status   string
}

func ReadActiveWorkshopBatch(ctx context.Context, db *sql.DB, workspace string) (ActiveWorkshopBatch, error) {
	var batch ActiveWorkshopBatch
	err := db.QueryRowContext(ctx, `
		SELECT b."id", b."snapshotJson", b."status"
		FROM "WorkshopBatchState" s
		JOIN "WorkshopBatch" b ON b."id" = s."activeBatchId" AND b."workspaceId" = s."workspaceId"
		WHERE s."workspaceId" = ?`, workspace).Scan(&batch.ID, &batch.Snapshot, &batch.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return ActiveWorkshopBatch{}, nil
	}
	return batch, err
}

type OutputReview struct {
	BatchID     string
	ProductID   string
	TaskID      string
	Decision    string
	Fidelity    *int
	Composition *int
	Aesthetic   *int
	Consistency *int
	ReasonCodes []string
	Note        string
	AssetIDs    []string
}

type reviewExec interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func InsertOutputReview(ctx context.Context, db reviewExec, workspace string, review OutputReview) error {
	reasons, err := json.Marshal(review.ReasonCodes)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = db.ExecContext(ctx, `
		INSERT INTO "WorkshopOutputReview"
		("id", "workspaceId", "batchId", "productId", "taskId", "decision", "productFidelityScore", "compositionScore", "aestheticScore", "consistencyScore", "reasonCodesJson", "note", "createdAt")
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		"wor_"+randomID(), workspace, review.BatchID, review.ProductID, review.TaskID, review.Decision,
		review.Fidelity, review.Composition, review.Aesthetic, review.Consistency, string(reasons), review.Note, now)
	if err != nil {
		return err
	}
	event := map[string]string{
		"accepted": "output_accepted", "retry_requested": "retry_requested", "rejected": "output_rejected",
	}[review.Decision]
	for _, assetID := range review.AssetIDs {
		if assetID == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, `
			INSERT INTO "PromptAssetUsageEvent"
			("id", "workspaceId", "assetId", "batchId", "productId", "taskId", "eventType", "createdAt", "metadata")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
			"uev_"+randomID(), workspace, assetID, review.BatchID, review.ProductID, review.TaskID, event, now); err != nil {
			return err
		}
	}
	return nil
}

func randomID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "review"
	}
	return hex.EncodeToString(buf[:])
}

var ErrWorkspaceConflict = errors.New("工作区已被其他窗口更新，请保留当前内容后重新加载")

type WorkshopWorkspace struct {
	Revision  int
	Snapshot  string
	UpdatedAt string
	Empty     bool
}

func ReadWorkshopWorkspace(ctx context.Context, db *sql.DB, workspace, id string) (WorkshopWorkspace, error) {
	var row WorkshopWorkspace
	err := db.QueryRowContext(ctx, `
		SELECT revision, snapshotJson, updatedAt FROM WorkshopWorkspace
		WHERE id = ? AND workspaceId = ?`, id, workspace).Scan(&row.Revision, &row.Snapshot, &row.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return WorkshopWorkspace{Empty: true}, nil
	}
	return row, err
}

func WriteWorkshopWorkspace(ctx context.Context, db *sql.DB, workspace, id string, revision int, snapshot, updatedAt string) (int, error) {
	var changed int64
	var err error
	if revision == 0 {
		result, execErr := db.ExecContext(ctx, `
			INSERT OR IGNORE INTO WorkshopWorkspace (id, workspaceId, revision, snapshotJson, updatedAt)
			VALUES (?, ?, 1, ?, ?)`, id, workspace, snapshot, updatedAt)
		err = execErr
		if err == nil {
			changed, err = result.RowsAffected()
		}
	} else {
		result, execErr := db.ExecContext(ctx, `
			UPDATE WorkshopWorkspace SET revision = revision + 1, snapshotJson = ?, updatedAt = ?
			WHERE id = ? AND workspaceId = ? AND revision = ?`, snapshot, updatedAt, id, workspace, revision)
		err = execErr
		if err == nil {
			changed, err = result.RowsAffected()
		}
	}
	if err != nil {
		return 0, err
	}
	if changed != 1 {
		return 0, ErrWorkspaceConflict
	}
	return revision + 1, nil
}
