package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func migrateDatabase(ctx context.Context, db *sql.DB, databasePath string) error {
	items := mustMigrations()
	applied, err := readApplied(ctx, db)
	if err != nil {
		return err
	}
	pending, err := pendingMigrations(applied, items)
	if err != nil {
		return err
	}
	if len(pending) == 0 {
		return verifyBaseline(ctx, db)
	}
	backupPath, err := backupDatabase(ctx, db, databasePath, pending)
	if err != nil {
		return err
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, `BEGIN IMMEDIATE`); err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.ExecContext(context.Background(), `ROLLBACK`)
		}
	}()
	txCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	if err := applyPending(txCtx, conn, items); err != nil {
		return fmt.Errorf("Database upgrade rolled back; backup: %s. %w", backupPath, err)
	}
	if _, err := conn.ExecContext(txCtx, `COMMIT`); err != nil {
		return fmt.Errorf("Database upgrade rolled back; backup: %s. %w", backupPath, err)
	}
	committed = true
	return nil
}

func applyPending(ctx context.Context, db execer, items []migration) error {
	if err := exec(ctx, db, `CREATE TABLE IF NOT EXISTS "_BeikeMigration" (version TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, appliedAt TEXT NOT NULL)`); err != nil {
		return err
	}
	applied, err := readApplied(ctx, db)
	if err != nil {
		return err
	}
	pending, err := pendingMigrations(applied, items)
	if err != nil {
		return err
	}
	for _, item := range pending {
		if err := item.apply(ctx, db); err != nil {
			return err
		}
		if err := exec(ctx, db, `INSERT INTO "_BeikeMigration" (version, checksum, appliedAt) VALUES (?, ?, ?)`, item.version, item.checksum, time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			return err
		}
	}
	return verifyBaseline(ctx, db)
}

func readApplied(ctx context.Context, db execer) (map[string]string, error) {
	exists, err := tableExists(ctx, db, "_BeikeMigration")
	if err != nil || !exists {
		return map[string]string{}, err
	}
	rows, err := db.QueryContext(ctx, `SELECT version, checksum FROM "_BeikeMigration"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	applied := map[string]string{}
	for rows.Next() {
		var version, checksum string
		if err := rows.Scan(&version, &checksum); err != nil {
			return nil, err
		}
		applied[version] = checksum
	}
	return applied, rows.Err()
}

func backupDatabase(ctx context.Context, db *sql.DB, databasePath string, pending []migration) (string, error) {
	directory := filepath.Join(filepath.Dir(databasePath), "database-backups")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", err
	}
	backupPath := filepath.Join(directory, "before-"+pending[0].version+"-"+newUUID()+".db")
	if _, err := db.ExecContext(ctx, `VACUUM INTO ?`, backupPath); err != nil {
		escaped := stringsReplace(backupPath)
		if _, err2 := db.ExecContext(ctx, `VACUUM INTO '`+escaped+`'`); err2 != nil {
			return "", err
		}
	}
	if err := os.Chmod(backupPath, 0o600); err != nil {
		return "", err
	}
	file, err := os.OpenFile(backupPath, os.O_RDWR, 0)
	if err != nil {
		return "", err
	}
	err = file.Sync()
	file.Close()
	if err != nil {
		return "", err
	}
	for _, item := range pending {
		if item.version != "20260915_01_asset_organization" {
			continue
		}
		exists, err := tableExists(ctx, db, "FullPromptAsset")
		if err != nil {
			return "", err
		}
		if !exists {
			break
		}
		preview, err := previewAssetOrganization(ctx, db)
		if err != nil {
			return "", err
		}
		body, err := json.MarshalIndent(preview, "", "  ")
		if err != nil {
			return "", err
		}
		if err := os.WriteFile(backupPath+".groups.json", append(body, '\n'), 0o600); err != nil {
			return "", err
		}
	}
	return backupPath, nil
}

func stringsReplace(path string) string {
	out := ""
	for _, char := range path {
		if char == '\'' {
			out += "''"
		} else {
			out += string(char)
		}
	}
	return out
}
