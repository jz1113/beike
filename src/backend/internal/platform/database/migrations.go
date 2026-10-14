// Package database opens the existing SQLite file without taking over its migration chain.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

// Check opens the current database read-only and reports the latest _BeikeMigration version.
// Schema changes still run through the existing migration script before the API listens.
func Check(path string) error {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return err
	}
	var version string
	err = db.QueryRowContext(ctx, `SELECT version FROM "_BeikeMigration" ORDER BY version DESC LIMIT 1`).Scan(&version)
	if err == sql.ErrNoRows {
		log.Printf("→ [数据库] %s 还没有迁移记录", path)
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取迁移记录: %w", err)
	}
	log.Printf("→ [数据库] 已识别迁移 %s", version)
	return nil
}
