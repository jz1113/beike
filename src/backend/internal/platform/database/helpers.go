// Package database opens the existing SQLite file without taking over its migration chain.
package database

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const OfficialWorkspace = "official"
const PromptSubcategoryPrefix = "prompt_subcategory:"

var sqliteURIPathEscaper = strings.NewReplacer("#", "%23", "?", "%3f")

type ErrText string

func (err ErrText) Error() string { return string(err) }

type Scanner interface {
	Scan(dest ...any) error
}

type RecordCounts struct {
	ImageTaskCount       int
	ProductCount         int
	SceneCount           int
	OutfitCount          int
	ActionCount          int
	PersonaCount         int
	StyleRecipeCount     int
	AssistantThreadCount int
	PromptRecordCount    int
}

// OpenRequired rejects an absent configured path. The caller retains ownership
// of closing the connection; migrations remain an explicit startup operation.
func OpenRequired(path string) (*sql.DB, error) {
	if path == "" {
		return nil, errors.New("missing database")
	}
	return OpenWrite(path)
}

func OpenWrite(path string) (*sql.DB, error) {
	escaped := sqliteURIPathEscaper.Replace(path)
	return sql.Open("sqlite", "file:"+escaped+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)")
}

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

func CountRecords(path, workspace string) (RecordCounts, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return RecordCounts{}, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var counts RecordCounts
	counts.ImageTaskCount = countRows(ctx, db, "ImageTask", workspace, false)
	counts.ProductCount = countRows(ctx, db, "Product", workspace, false)
	counts.SceneCount = countRows(ctx, db, "SceneAsset", workspace, true)
	counts.OutfitCount = countRows(ctx, db, "OutfitAsset", workspace, true)
	counts.ActionCount = countRows(ctx, db, "ActionAsset", workspace, true)
	counts.PersonaCount = countRows(ctx, db, "PersonaAsset", workspace, true)
	counts.StyleRecipeCount = countRows(ctx, db, "StyleRecipe", workspace, true)
	counts.AssistantThreadCount = countRows(ctx, db, "AssistantThread", workspace, false)
	counts.PromptRecordCount = countRows(ctx, db, "PromptRecord", workspace, false)
	return counts, nil
}

func countRows(ctx context.Context, db *sql.DB, table, workspace string, shared bool) int {
	query := `SELECT COUNT(*) FROM "` + table + `" WHERE "workspaceId" = ?`
	args := []any{workspace}
	if shared {
		query = `SELECT COUNT(*) FROM "` + table + `" WHERE "workspaceId" IN (?, ?)`
		args = []any{workspace, OfficialWorkspace}
	}
	var count int
	if err := db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return 0
	}
	return count
}

func LoadCollectedProduct(ctx context.Context, db *sql.DB, workspace, platform, itemID string) (string, string, string, string, string, bool, error) {
	var id, createdAt string
	var title, picURL, detailURLs sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "id", "title", "picUrl", "detailUrls", "createdAt" FROM "Product"
		WHERE "workspaceId" = ? AND "platform" = ? AND "itemId" = ?`, workspace, platform, itemID).Scan(&id, &title, &picURL, &detailURLs, &createdAt)
	if err == sql.ErrNoRows {
		return "", "", "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", "", "", false, err
	}
	return id, StringValue(title), StringValue(picURL), StringValue(detailURLs), FormatSQLiteTime(createdAt), true, nil
}

func SaveCollectDetail(ctx context.Context, db *sql.DB, workspace, platform, itemID, title, picURL, detailURLs string) (string, string, error) {
	var id, createdAt string
	err := db.QueryRowContext(ctx, `
		SELECT "id", "createdAt" FROM "Product"
		WHERE "workspaceId" = ? AND "platform" = ? AND "itemId" = ?`, workspace, platform, itemID).Scan(&id, &createdAt)
	if err == sql.ErrNoRows {
		id, err = RandomHex()
		if err != nil {
			return "", "", err
		}
		createdAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		_, err = db.ExecContext(ctx, `
			INSERT INTO "Product" ("id", "workspaceId", "platform", "itemId", "title", "picUrl", "detailUrls", "createdAt")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, workspace, platform, itemID, title, picURL, detailURLs, createdAt)
		return id, createdAt, err
	}
	if err != nil {
		return "", "", err
	}
	_, err = db.ExecContext(ctx, `
		UPDATE "Product" SET "title" = ?, "picUrl" = ?, "detailUrls" = ?
		WHERE "id" = ? AND "workspaceId" = ?`, title, picURL, detailURLs, id, workspace)
	return id, FormatSQLiteTime(createdAt), err
}

func ImageTaskOwners(ctx context.Context, db *sql.DB, resultURL string) ([]string, error) {
	rows, err := db.QueryContext(ctx, `SELECT DISTINCT "workspaceId" FROM "ImageTask" WHERE "resultUrl" = ?`, resultURL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	owners := []string{}
	for rows.Next() {
		var owner string
		if err := rows.Scan(&owner); err != nil {
			return nil, err
		}
		owners = append(owners, owner)
	}
	return owners, rows.Err()
}

func UniqueIDs(ids []string) []string {
	seen := map[string]struct{}{}
	unique := []string{}
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	return unique
}

func CategoryJSON(values []string) string {
	if values == nil {
		values = []string{}
	}
	body, _ := json.Marshal(values)
	return string(body)
}

func StringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func CategoryIDList(raw string) []string {
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return nil
	}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, item := range parsed {
		text, ok := item.(string)
		if !ok || text == "" {
			continue
		}
		if _, ok := seen[text]; ok {
			continue
		}
		seen[text] = struct{}{}
		ids = append(ids, text)
	}
	return ids
}

func BuiltinSubcategory(value string) bool {
	switch value {
	case "phone", "case", "earphone", "tablet":
		return true
	default:
		return false
	}
}

func BuiltinFolderID(value string) string {
	return PromptSubcategoryPrefix + "digital_3c:" + value
}

func RandomHex() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func NewID() (string, error) {
	return RandomHex()
}

func FormatSQLiteTime(raw string) string {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05", "2006-01-02T15:04:05.000Z"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC().Format("2006-01-02T15:04:05.000Z")
		}
	}
	return raw
}

func NullText(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func QuestionMarks(count int) string {
	marks := make([]string, count)
	for i := range marks {
		marks[i] = "?"
	}
	return strings.Join(marks, ",")
}

func WriteMediaReviews(root, workspace string, urls, ids []string) error {
	dir := filepath.Join(root, workspace)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, item := range urls {
		if _, ok := seen[item]; ok || strings.HasPrefix(item, "data:") || strings.HasPrefix(item, "blob:") {
			continue
		}
		seen[item] = struct{}{}
		sum := sha256.Sum256([]byte(item))
		body, err := json.Marshal(map[string]any{
			"url":      item,
			"source":   map[string]any{"assetType": "imageTask", "ids": ids},
			"state":    "retained-reference-check-required",
			"queuedAt": time.Now().UTC().Format(time.RFC3339Nano),
		})
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, hex.EncodeToString(sum[:])+".json"), body, 0o600); err != nil {
			return err
		}
	}
	return nil
}

func StringsToAny(values []string) []any {
	items := make([]any, len(values))
	for i, value := range values {
		items[i] = value
	}
	return items
}

func EscapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}
