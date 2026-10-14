package migrate

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

var boolKeys = map[string]bool{"isFavorite": true, "hasHuman": true, "isUniversal": true}
var intKeys = map[string]bool{"sourceImageIndex": true, "groupIndex": true, "usageCount": true, "shotOrder": true, "productFrameRatio": true, "position": true, "displayNumber": true}

func insertMissing(ctx context.Context, db execer, table string, rows []map[string]any, keys []string, prepare func(context.Context, execer, map[string]any) error) int {
	if len(rows) == 0 {
		return 0
	}
	existing := map[string]bool{}
	ids, err := queryStrings(ctx, db, `SELECT "id" FROM `+ident(table))
	if err != nil {
		log.Printf("[officialCatalogSeed] %s 读取已有记录失败: %v", table, err)
		return 0
	}
	for _, id := range ids {
		existing[id] = true
	}
	inserted := 0
	for _, row := range rows {
		id, _ := row["id"].(string)
		if id != "" && existing[id] {
			continue
		}
		fields := pickRow(row, keys)
		if prepare != nil {
			if err := prepare(ctx, db, fields); err != nil {
				continue
			}
		}
		ensureTimestamps(ctx, db, table, fields)
		if err := insertRow(ctx, db, table, fields); err != nil {
			if !strings.Contains(err.Error(), "UNIQUE") {
				log.Printf("[officialCatalogSeed] %s 跳过 %s: %v", table, id, err)
			}
			continue
		}
		inserted++
	}
	return inserted
}

func ensureTimestamps(ctx context.Context, db execer, table string, fields map[string]any) {
	now := isoNow()
	for _, key := range []string{"createdAt", "updatedAt"} {
		if _, ok := fields[key]; ok {
			continue
		}
		present, err := hasColumn(ctx, db, table, key)
		if err == nil && present {
			fields[key] = now
		}
	}
}

func pickRow(row map[string]any, keys []string) map[string]any {
	out := map[string]any{"workspaceId": officialWorkspace}
	for _, key := range keys {
		value, ok := row[key]
		if !ok || value == nil {
			continue
		}
		switch {
		case boolKeys[key]:
			out[key] = asBool(value)
		case intKeys[key]:
			if number, ok := asInt(value); ok {
				out[key] = number
			}
		case key == "createdAt" || key == "updatedAt":
			continue
		default:
			out[key] = value
		}
	}
	return out
}

func asBool(value any) int {
	switch typed := value.(type) {
	case bool:
		if typed {
			return 1
		}
	case float64:
		if typed != 0 {
			return 1
		}
	case string:
		if typed == "1" || typed == "true" {
			return 1
		}
	}
	return 0
}

func asInt(value any) (int, bool) {
	switch typed := value.(type) {
	case float64:
		return int(typed), true
	case string:
		var number int
		if _, err := fmt.Sscan(typed, &number); err == nil {
			return number, true
		}
	}
	return 0, false
}

func insertRow(ctx context.Context, db execer, table string, fields map[string]any) error {
	columns := make([]string, 0, len(fields))
	holders := make([]string, 0, len(fields))
	args := make([]any, 0, len(fields))
	for key, value := range fields {
		if key != "workspaceId" && key != "displayNumber" && !safeKey(key) {
			continue
		}
		columns = append(columns, ident(key))
		holders = append(holders, "?")
		args = append(args, normalizeValue(value))
	}
	return exec(ctx, db, `INSERT INTO `+ident(table)+` (`+strings.Join(columns, ",")+`) VALUES (`+strings.Join(holders, ",")+`)`, args...)
}

func safeKey(key string) bool {
	for _, char := range key {
		if char != '_' && (char < 'A' || char > 'Z') && (char < 'a' || char > 'z') && (char < '0' || char > '9') {
			return false
		}
	}
	return key != ""
}

func normalizeValue(value any) any {
	switch typed := value.(type) {
	case map[string]any, []any:
		body, err := json.Marshal(typed)
		if err != nil {
			return nil
		}
		return string(body)
	default:
		return typed
	}
}

func Run(databasePath, root string, adoptLocal bool) error {
	if strings.TrimSpace(databasePath) == "" {
		return fmt.Errorf("缺少数据库路径")
	}
	if err := os.MkdirAll(filepath.Dir(databasePath), 0o755); err != nil {
		return err
	}
	db, err := sql.Open("sqlite", "file:"+databasePath+"?_pragma=busy_timeout(10000)")
	if err != nil {
		return err
	}
	defer db.Close()
	ctx := context.Background()
	for _, pragma := range []string{
		`PRAGMA busy_timeout = 10000`,
		`PRAGMA journal_mode = WAL`,
		`PRAGMA synchronous = NORMAL`,
		`PRAGMA wal_autocheckpoint = 1000`,
		`PRAGMA cache_size = -64000`,
	} {
		if _, err := db.ExecContext(ctx, pragma); err != nil {
			return err
		}
	}
	if err := migrateDatabase(ctx, db, databasePath); err != nil {
		return err
	}
	if err := seedOfficialCatalog(ctx, db, root, databasePath); err != nil {
		return err
	}
	if adoptLocal {
		if err := AdoptLegacyWorkspaceRows(ctx, db); err != nil {
			return err
		}
	}
	log.Printf("SQLite migrations verified: %s", databasePath)
	return nil
}
