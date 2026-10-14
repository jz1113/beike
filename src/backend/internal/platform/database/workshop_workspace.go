package database

import (
	"context"
	"database/sql"
	"errors"
)

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
