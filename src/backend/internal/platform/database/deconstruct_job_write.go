package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

var ErrJobConflict = errors.New("job_input_conflict")
var ErrJobCapacity = errors.New("job_capacity_reached")
var ErrJobMissing = errors.New("job_not_found")

type DeconstructJobCreate struct {
	JobID            string
	InputHash        string
	ConfigJSON       string
	Concurrency      int
	ReviewBeforeSave bool
	Items            []DeconstructJobItem
}

type DeconstructJobItem struct {
	ID    string
	Input map[string]any
}

type CreatedDeconstructJob struct {
	Reused bool
	Job    map[string]any
}

func CreateDeconstructJob(ctx context.Context, db *sql.DB, workspace, storageRoot string, input DeconstructJobCreate) (CreatedDeconstructJob, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return CreatedDeconstructJob{}, err
	}
	defer tx.Rollback()
	var existingHash string
	err = tx.QueryRowContext(ctx, `SELECT "inputHash" FROM "DeconstructJob" WHERE "workspaceId" = ? AND "jobId" = ?`, workspace, input.JobID).Scan(&existingHash)
	if err == nil {
		if existingHash != input.InputHash {
			return CreatedDeconstructJob{}, ErrJobConflict
		}
		if err := tx.Commit(); err != nil {
			return CreatedDeconstructJob{}, err
		}
		job, _, err := GetDeconstructJob(ctx, db, workspace, storageRoot, input.JobID)
		return CreatedDeconstructJob{Reused: true, Job: job}, err
	}
	if err != sql.ErrNoRows {
		return CreatedDeconstructJob{}, err
	}
	var active int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM "DeconstructJob" WHERE "workspaceId" = ? AND "status" IN ('queued','running','stopping')`, workspace).Scan(&active); err != nil {
		return CreatedDeconstructJob{}, err
	}
	if active >= 5 {
		return CreatedDeconstructJob{}, ErrJobCapacity
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id, err := newID()
	if err != nil {
		return CreatedDeconstructJob{}, err
	}
	review := 0
	if input.ReviewBeforeSave {
		review = 1
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "DeconstructJob" ("id","workspaceId","jobId","inputHash","status","configJson","concurrency","reviewBeforeSave","stopRequested","createdAt","updatedAt")
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, workspace, input.JobID, input.InputHash, "queued", input.ConfigJSON, input.Concurrency, review, 0, now, now); err != nil {
		return CreatedDeconstructJob{}, err
	}
	for position, item := range input.Items {
		raw, err := json.Marshal(item.Input)
		if err != nil {
			return CreatedDeconstructJob{}, err
		}
		itemID, err := newID()
		if err != nil {
			return CreatedDeconstructJob{}, err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO "DeconstructJobItem" ("id","workspaceId","jobId","itemId","position","inputJson","status","updatedAt")
			VALUES (?,?,?,?,?,?,?,?)`, itemID, workspace, input.JobID, item.ID, position, string(raw), "queued", now); err != nil {
			return CreatedDeconstructJob{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return CreatedDeconstructJob{}, err
	}
	job, _, err := GetDeconstructJob(ctx, db, workspace, storageRoot, input.JobID)
	return CreatedDeconstructJob{Job: job}, err
}

type ClaimedJobItem struct {
	ItemID string
	Input  map[string]any
}

func ClaimDeconstructJobItem(ctx context.Context, db *sql.DB, workspace, jobID string) (*ClaimedJobItem, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var jobRow string
	err = tx.QueryRowContext(ctx, `SELECT "id" FROM "DeconstructJob" WHERE "workspaceId" = ? AND "jobId" = ? AND "status" IN ('queued','running','stopping') AND "stopRequested" = 0`, workspace, jobID).Scan(&jobRow)
	if err == sql.ErrNoRows {
		return nil, tx.Commit()
	}
	if err != nil {
		return nil, err
	}
	var rowID, itemID, inputJSON string
	err = tx.QueryRowContext(ctx, `SELECT "id","itemId","inputJson" FROM "DeconstructJobItem" WHERE "workspaceId" = ? AND "jobId" = ? AND "status" = 'queued' ORDER BY "position" ASC LIMIT 1`, workspace, jobID).Scan(&rowID, &itemID, &inputJSON)
	if err == sql.ErrNoRows {
		return nil, tx.Commit()
	}
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	result, err := tx.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "status" = 'running', "startedAt" = ?, "updatedAt" = ? WHERE "id" = ? AND "status" = 'queued'`, now, now, rowID)
	if err != nil {
		return nil, err
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		return nil, tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, `UPDATE "DeconstructJob" SET "status" = 'running', "updatedAt" = ? WHERE "id" = ?`, now, jobRow); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	var input map[string]any
	if json.Unmarshal([]byte(inputJSON), &input) != nil {
		return nil, errors.New("任务内容无法读取")
	}
	return &ClaimedJobItem{ItemID: itemID, Input: input}, nil
}

func CommitDeconstructDispatch(ctx context.Context, db *sql.DB, workspace, jobID, itemID string) (bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var id string
	err = tx.QueryRowContext(ctx, `SELECT "id" FROM "DeconstructJob" WHERE "workspaceId" = ? AND "jobId" = ? AND "stopRequested" = 0 AND "status" IN ('queued','running','stopping')`, workspace, jobID).Scan(&id)
	if err == sql.ErrNoRows {
		return false, tx.Commit()
	}
	if err != nil {
		return false, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	result, err := tx.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "dispatchedAt" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "itemId" = ? AND "status" = 'running'`, now, now, workspace, jobID, itemID)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	changed, _ := result.RowsAffected()
	return changed == 1, nil
}

func UpdateDeconstructItemProgress(ctx context.Context, db *sql.DB, workspace, jobID, itemID string, progress any) error {
	raw, err := json.Marshal(progress)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	result, err := db.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "progressJson" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "itemId" = ? AND "status" = 'running'`, string(raw), now, workspace, jobID, itemID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 1 {
		_, err = db.ExecContext(ctx, `UPDATE "DeconstructJob" SET "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "status" IN ('queued','running','stopping')`, now, workspace, jobID)
	}
	return err
}

func FinishDeconstructJobItem(ctx context.Context, db *sql.DB, workspace, jobID, itemID, status string, result any, itemError string) error {
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var itemErrorValue any
	if itemError != "" {
		itemErrorValue = itemError
	}
	res, err := db.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "status" = ?, "resultJson" = ?, "error" = ?, "finishedAt" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "itemId" = ? AND "status" = 'running'`, status, string(raw), itemErrorValue, now, now, workspace, jobID, itemID)
	if err != nil {
		return err
	}
	if changed, _ := res.RowsAffected(); changed == 1 {
		_, err = db.ExecContext(ctx, `UPDATE "DeconstructJob" SET "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "status" IN ('queued','running','stopping')`, now, workspace, jobID)
	}
	return err
}

func FinalizeDeconstructJob(ctx context.Context, db *sql.DB, workspace, jobID string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var stop int
	var status string
	err = tx.QueryRowContext(ctx, `SELECT "status","stopRequested" FROM "DeconstructJob" WHERE "workspaceId" = ? AND "jobId" = ? AND "status" IN ('queued','running','stopping')`, workspace, jobID).Scan(&status, &stop)
	if err == sql.ErrNoRows {
		return tx.Commit()
	}
	if err != nil {
		return err
	}
	rows, err := tx.QueryContext(ctx, `SELECT "status" FROM "DeconstructJobItem" WHERE "workspaceId" = ? AND "jobId" = ?`, workspace, jobID)
	if err != nil {
		return err
	}
	var interrupted, failed, open bool
	for rows.Next() {
		var itemStatus string
		if err := rows.Scan(&itemStatus); err != nil {
			rows.Close()
			return err
		}
		switch itemStatus {
		case "running", "queued":
			open = true
		case "interrupted":
			interrupted = true
		case "error":
			failed = true
		}
	}
	rows.Close()
	if open {
		return tx.Commit()
	}
	next := "completed"
	if interrupted {
		next = "interrupted"
	} else if stop != 0 {
		next = "stopped"
	} else if failed {
		next = "failed"
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = tx.ExecContext(ctx, `UPDATE "DeconstructJob" SET "status" = ?, "finishedAt" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ?`, next, now, now, workspace, jobID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func StopDeconstructJob(ctx context.Context, db *sql.DB, workspace, jobID string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	err = tx.QueryRowContext(ctx, `SELECT "status" FROM "DeconstructJob" WHERE "workspaceId" = ? AND "jobId" = ?`, workspace, jobID).Scan(&status)
	if err == sql.ErrNoRows {
		return ErrJobMissing
	}
	if err != nil {
		return err
	}
	if status != "queued" && status != "running" && status != "stopping" {
		return tx.Commit()
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(ctx, `UPDATE "DeconstructJob" SET "stopRequested" = 1, "status" = 'stopping', "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ?`, now, workspace, jobID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "status" = 'stopped', "error" = '已停止，未派发模型请求', "finishedAt" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "status" = 'queued'`, now, now, workspace, jobID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return FinalizeDeconstructJob(ctx, db, workspace, jobID)
}

func RecoverDeconstructJobs(ctx context.Context, db *sql.DB) (int, error) {
	rows, err := db.QueryContext(ctx, `SELECT "workspaceId","jobId" FROM "DeconstructJob" WHERE "status" IN ('queued','running','stopping')`)
	if err != nil {
		return 0, err
	}
	type pair struct{ workspace, jobID string }
	var jobs []pair
	for rows.Next() {
		var item pair
		if err := rows.Scan(&item.workspace, &item.jobID); err != nil {
			rows.Close()
			return 0, err
		}
		jobs = append(jobs, item)
	}
	rows.Close()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, job := range jobs {
		if _, err := db.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "status" = 'interrupted', "error" = '服务已重启，尚未派发的任务已暂停，请手动重试', "finishedAt" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "status" IN ('queued','running') AND "dispatchedAt" IS NULL`, now, now, job.workspace, job.jobID); err != nil {
			return 0, err
		}
		if _, err := db.ExecContext(ctx, `UPDATE "DeconstructJobItem" SET "status" = 'interrupted', "error" = '服务已重启，模型请求结果未知；请核对资产库和审核候选，勿直接重复付费', "finishedAt" = ?, "updatedAt" = ? WHERE "workspaceId" = ? AND "jobId" = ? AND "status" = 'running' AND "dispatchedAt" IS NOT NULL`, now, now, job.workspace, job.jobID); err != nil {
			return 0, err
		}
		if _, err := db.ExecContext(ctx, `UPDATE "DeconstructJob" SET "status" = 'interrupted', "stopRequested" = 1, "finishedAt" = ?, "updatedAt" = ?, "error" = '服务重启后任务已暂停，请核对结果再手动重试；不会自动重放模型请求' WHERE "workspaceId" = ? AND "jobId" = ?`, now, now, job.workspace, job.jobID); err != nil {
			return 0, err
		}
	}
	return len(jobs), rows.Err()
}

func JobInputHash(items any, config any, baseURL string) string {
	raw, _ := json.Marshal(map[string]any{"items": items, "config": config, "baseUrl": baseURL})
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
