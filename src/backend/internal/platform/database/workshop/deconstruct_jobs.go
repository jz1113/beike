package workshop

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var resultFileName = regexp.MustCompile(`^[a-f0-9]{64}\.json$`)

func ListDeconstructJobs(ctx context.Context, db *sql.DB, workspace, storageRoot string) ([]map[string]any, error) {
	active, err := queryJobs(ctx, db, workspace, `t."status" IN ('queued','running','stopping')`, 0)
	if err != nil {
		return nil, err
	}
	recent, err := queryJobs(ctx, db, workspace, `t."status" NOT IN ('queued','running','stopping')`, 5)
	if err != nil {
		return nil, err
	}
	jobs := append(active, recent...)
	snapshots := make([]map[string]any, 0, len(jobs))
	for _, job := range jobs {
		snapshot, err := jobSnapshot(ctx, db, workspace, storageRoot, job, false)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, nil
}

func GetDeconstructJob(ctx context.Context, db *sql.DB, workspace, storageRoot, jobID string) (map[string]any, bool, error) {
	jobs, err := queryJobs(ctx, db, workspace, `t."jobId" = ?`, 0, jobID)
	if err != nil || len(jobs) == 0 {
		return nil, false, err
	}
	snapshot, err := jobSnapshot(ctx, db, workspace, storageRoot, jobs[0], true)
	if err != nil {
		return nil, false, err
	}
	return snapshot, true, nil
}

type jobRow struct {
	jobID, status, configJSON, createdAt, updatedAt string
	concurrency                                     int
	reviewBeforeSave                                int
	finishedAt, jobError                            sql.NullString
}

func queryJobs(ctx context.Context, db *sql.DB, workspace, extra string, limit int, args ...any) ([]jobRow, error) {
	query := `
		SELECT "jobId", "status", "configJson", "concurrency", "reviewBeforeSave", "error", "createdAt", "updatedAt", "finishedAt"
		FROM "DeconstructJob" t
		WHERE t."workspaceId" = ? AND ` + extra + ` ORDER BY t."createdAt" DESC`
	queryArgs := append([]any{workspace}, args...)
	if limit > 0 {
		query += ` LIMIT ?`
		queryArgs = append(queryArgs, limit)
	}
	rows, err := db.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := []jobRow{}
	for rows.Next() {
		var job jobRow
		if err := rows.Scan(&job.jobID, &job.status, &job.configJSON, &job.concurrency, &job.reviewBeforeSave, &job.jobError, &job.createdAt, &job.updatedAt, &job.finishedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func jobSnapshot(ctx context.Context, db *sql.DB, workspace, storageRoot string, job jobRow, includeData bool) (map[string]any, error) {
	items, err := jobItems(ctx, db, workspace, storageRoot, job.jobID, includeData)
	if err != nil {
		return nil, err
	}
	var config map[string]any
	_ = json.Unmarshal([]byte(job.configJSON), &config)
	snapshot := map[string]any{
		"jobId": job.jobID, "status": job.status, "items": items,
		"concurrency": job.concurrency, "reviewBeforeSave": job.reviewBeforeSave != 0,
		"createdAt": database.FormatSQLiteTime(job.createdAt), "updatedAt": database.FormatSQLiteTime(job.updatedAt),
	}
	if model, ok := config["model"].(string); ok {
		snapshot["model"] = model
	}
	if job.finishedAt.Valid && job.finishedAt.String != "" {
		snapshot["finishedAt"] = database.FormatSQLiteTime(job.finishedAt.String)
	}
	if job.jobError.Valid && job.jobError.String != "" {
		snapshot["error"] = job.jobError.String
	}
	return snapshot, nil
}

func jobItems(ctx context.Context, db *sql.DB, workspace, storageRoot, jobID string, includeData bool) ([]any, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT "inputJson", "status", "progressJson", "resultJson", "error", "startedAt", "finishedAt"
		FROM "DeconstructJobItem" WHERE "workspaceId" = ? AND "jobId" = ? ORDER BY "position" ASC`, workspace, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var inputJSON, status string
		var progressJSON, resultJSON, itemError, startedAt, finishedAt sql.NullString
		if err := rows.Scan(&inputJSON, &status, &progressJSON, &resultJSON, &itemError, &startedAt, &finishedAt); err != nil {
			return nil, err
		}
		var input map[string]any
		if err := json.Unmarshal([]byte(inputJSON), &input); err != nil {
			return nil, err
		}
		if !includeData {
			delete(input, "customSubCategories")
		}
		input["status"] = status
		if progressJSON.Valid && progressJSON.String != "" {
			var progress any
			if err := json.Unmarshal([]byte(progressJSON.String), &progress); err != nil {
				return nil, err
			}
			input["progress"] = progress
		}
		if resultJSON.Valid && resultJSON.String != "" {
			var result map[string]any
			if err := json.Unmarshal([]byte(resultJSON.String), &result); err != nil {
				return nil, err
			}
			if ok, _ := result["ok"].(bool); ok {
				if includeData {
					if ref, _ := result["dataRef"].(string); ref != "" {
						data, err := readJobResult(storageRoot, workspace, ref)
						if err != nil {
							return nil, err
						}
						result["data"] = data
					}
				} else {
					result["data"] = nil
				}
			}
			input["result"] = result
		}
		if itemError.Valid && itemError.String != "" {
			input["error"] = itemError.String
		}
		if startedAt.Valid && startedAt.String != "" {
			input["startedAt"] = database.FormatSQLiteTime(startedAt.String)
		}
		if finishedAt.Valid && finishedAt.String != "" {
			input["finishedAt"] = database.FormatSQLiteTime(finishedAt.String)
		}
		items = append(items, input)
	}
	return items, rows.Err()
}

func readJobResult(storageRoot, workspace, reference string) (any, error) {
	if !strings.HasPrefix(reference, "/storage/") {
		return nil, os.ErrInvalid
	}
	relative := strings.TrimPrefix(reference, "/storage/")
	prefix := workspace + "/deconstruct-results/"
	name := strings.TrimPrefix(relative, prefix)
	if !strings.HasPrefix(relative, prefix) || !resultFileName.MatchString(name) || strings.Contains(relative, "..") {
		return nil, os.ErrInvalid
	}
	body, err := os.ReadFile(filepath.Join(storageRoot, filepath.FromSlash(relative)))
	if err != nil {
		return nil, err
	}
	var data any
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, err
	}
	return data, nil
}
