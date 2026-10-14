package workshop

import (
	"context"
	"database/sql"
)

type MigrationTask struct {
	ID        string
	TaskID    string
	ResultURL string
	MediaType string
}

func ListMigrationTasks(ctx context.Context, db *sql.DB, workspace, cursor string, limit int) ([]MigrationTask, error) {
	query := `
		SELECT "id", COALESCE("taskId", ''), COALESCE("resultUrl", ''), COALESCE("mediaType", '')
		FROM "ImageTask"
		WHERE "workspaceId" = ? AND "status" = 'SUCCESS' AND "resultUrl" IS NOT NULL`
	args := []any{workspace}
	if cursor != "" {
		query += ` AND "id" > ?`
		args = append(args, cursor)
	}
	query += ` ORDER BY "id" ASC LIMIT ?`
	args = append(args, limit)
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := []MigrationTask{}
	for rows.Next() {
		var task MigrationTask
		if err := rows.Scan(&task.ID, &task.TaskID, &task.ResultURL, &task.MediaType); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func UpdateTaskResultURL(ctx context.Context, db *sql.DB, workspace, id, resultURL string) error {
	_, err := db.ExecContext(ctx, `
		UPDATE "ImageTask" SET "resultUrl" = ? WHERE "workspaceId" = ? AND "id" = ?`, resultURL, workspace, id)
	return err
}
