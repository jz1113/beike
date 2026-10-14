package database

import (
	"context"
	"database/sql"
	"time"
)

// FailOrphanTasks marks in-progress tasks that never received an upstream id as failed.
// Tasks that already have an upstream id are left running: failing them locally would
// cause a paid resubmit. The previous Node helper for stale submitted tasks was a no-op.
func FailOrphanTasks(path string) (int, error) {
	db, err := OpenWrite(path)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := db.ExecContext(ctx, `
		UPDATE "ImageTask"
		SET "status" = 'FAILURE', "failReason" = '服务重启，未提交至云端的孤儿任务已自动终止'
		WHERE "status" = 'IN_PROGRESS' AND ("taskId" IS NULL OR "taskId" = '')`)
	if err != nil {
		return 0, err
	}
	count, _ := result.RowsAffected()
	return int(count), nil
}

func Checkpoint(path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`)
	return err
}
