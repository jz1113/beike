package workshop

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"net/url"
	"strings"
)

type TaskRemoval struct {
	Count        int          `json:"count"`
	MediaCleanup MediaCleanup `json:"mediaCleanup"`
	Warning      string       `json:"warning,omitempty"`
}

type MediaCleanup struct {
	Deleted  int `json:"deleted"`
	Errors   int `json:"errors"`
	Skipped  int `json:"skipped"`
	Deferred int `json:"deferred"`
}

type TaskRemovalSelection struct {
	All    bool
	Failed bool
	IDs    []string
	URLs   []string
}

func RemoveImageTasks(ctx context.Context, db *sql.DB, workspace string, selection TaskRemovalSelection, protect []string, reviewRoot string, production bool) (TaskRemoval, error) {
	records, err := selectImageTasks(ctx, db, workspace, selection)
	if err != nil {
		return TaskRemoval{}, err
	}
	if len(records) == 0 {
		return TaskRemoval{MediaCleanup: MediaCleanup{}}, nil
	}
	ids := make([]string, 0, len(records))
	for _, record := range records {
		ids = append(ids, record.id)
	}
	if err := deleteImageTasks(ctx, db, workspace, ids); err != nil {
		return TaskRemoval{}, err
	}
	referenced, err := referencedResultURLs(ctx, db, workspace, resultURLs(records))
	if err != nil {
		return TaskRemoval{}, err
	}
	if len(records) > 5 {
		_, _ = db.ExecContext(ctx, `VACUUM`)
	}
	cleanup, warning := queueTaskMedia(records, protect, referenced, reviewRoot, workspace, production)
	return TaskRemoval{Count: len(records), MediaCleanup: cleanup, Warning: warning}, nil
}

type imageTaskRecord struct {
	id, resultURL string
}

func selectImageTasks(ctx context.Context, db *sql.DB, workspace string, selection TaskRemovalSelection) ([]imageTaskRecord, error) {
	query := `SELECT "id", "resultUrl" FROM "ImageTask" WHERE "workspaceId" = ?`
	args := []any{workspace}
	switch {
	case selection.All:
	case selection.Failed:
		query += ` AND "status" = 'FAILURE'`
	default:
		clauses := []string{}
		if len(selection.IDs) > 0 {
			marks := database.QuestionMarks(len(selection.IDs))
			clauses = append(clauses, `"id" IN (`+marks+`)`, `"taskId" IN (`+marks+`)`)
			for i := 0; i < 2; i++ {
				for _, id := range selection.IDs {
					args = append(args, id)
				}
			}
		}
		if len(selection.URLs) > 0 {
			clauses = append(clauses, `"resultUrl" IN (`+database.QuestionMarks(len(selection.URLs))+`)`)
			for _, item := range selection.URLs {
				args = append(args, item)
			}
		}
		if len(clauses) == 0 {
			return nil, nil
		}
		query += ` AND (` + strings.Join(clauses, ` OR `) + `)`
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []imageTaskRecord{}
	for rows.Next() {
		var record imageTaskRecord
		var result sql.NullString
		if err := rows.Scan(&record.id, &result); err != nil {
			return nil, err
		}
		if result.Valid {
			record.resultURL = result.String
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func deleteImageTasks(ctx context.Context, db *sql.DB, workspace string, ids []string) error {
	_, err := db.ExecContext(ctx, `
		DELETE FROM "ImageTask" WHERE "workspaceId" = ? AND "id" IN (`+database.QuestionMarks(len(ids))+`)`,
		append([]any{workspace}, database.StringsToAny(ids)...)...)
	return err
}

func referencedResultURLs(ctx context.Context, db *sql.DB, workspace string, urls []string) (map[string]struct{}, error) {
	referenced := map[string]struct{}{}
	if len(urls) == 0 {
		return referenced, nil
	}
	rows, err := db.QueryContext(ctx, `
		SELECT "resultUrl" FROM "ImageTask" WHERE "workspaceId" = ? AND "resultUrl" IN (`+database.QuestionMarks(len(urls))+`)`,
		append([]any{workspace}, database.StringsToAny(urls)...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var result sql.NullString
		if err := rows.Scan(&result); err != nil {
			return nil, err
		}
		if result.Valid && result.String != "" {
			referenced[result.String] = struct{}{}
		}
	}
	return referenced, rows.Err()
}

func resultURLs(records []imageTaskRecord) []string {
	seen := map[string]struct{}{}
	urls := []string{}
	for _, record := range records {
		if record.resultURL == "" {
			continue
		}
		if _, ok := seen[record.resultURL]; ok {
			continue
		}
		seen[record.resultURL] = struct{}{}
		urls = append(urls, record.resultURL)
	}
	return urls
}

func queueTaskMedia(records []imageTaskRecord, protect []string, referenced map[string]struct{}, reviewRoot, workspace string, production bool) (MediaCleanup, string) {
	cleanup := MediaCleanup{}
	protectedURLs := map[string]struct{}{}
	for _, item := range protect {
		if strings.TrimSpace(item) != "" {
			protectedURLs[strings.TrimSpace(item)] = struct{}{}
		}
	}
	for item := range referenced {
		protectedURLs[item] = struct{}{}
	}
	protectedKeys := map[string]struct{}{}
	for item := range protectedURLs {
		if key := localMediaIdentity(item, workspace, production); key != "" {
			protectedKeys[key] = struct{}{}
		}
	}
	eligible := []string{}
	ids := []string{}
	seen := map[string]struct{}{}
	for _, record := range records {
		ids = append(ids, record.id)
		if record.resultURL == "" {
			continue
		}
		if _, ok := seen[record.resultURL]; ok {
			continue
		}
		seen[record.resultURL] = struct{}{}
		key := localMediaIdentity(record.resultURL, workspace, production)
		if _, protected := protectedURLs[record.resultURL]; key == "" || protected || hasKey(protectedKeys, key) {
			cleanup.Skipped++
			continue
		}
		eligible = append(eligible, record.resultURL)
	}
	if len(eligible) == 0 {
		return cleanup, ""
	}
	if err := database.WriteMediaReviews(reviewRoot, workspace, eligible, ids); err != nil {
		cleanup.Errors = len(eligible)
		return cleanup, "记录已删除，但媒体清理复核暂不可用，原文件已保留"
	}
	cleanup.Deferred = len(eligible)
	return cleanup, ""
}

func localMediaIdentity(raw, workspace string, production bool) string {
	if !strings.HasPrefix(raw, "/storage/") || strings.ContainsAny(raw, "\\\x00") {
		return ""
	}
	pathOnly := raw
	if index := strings.IndexAny(pathOnly, "?#"); index >= 0 {
		pathOnly = pathOnly[:index]
	}
	if strings.Contains(pathOnly, "%") {
		return ""
	}
	relative, err := url.PathUnescape(strings.TrimPrefix(pathOnly, "/storage/"))
	if err != nil || strings.Contains(relative, "\\") {
		return ""
	}
	for _, char := range relative {
		if char < 32 {
			return ""
		}
	}
	for _, part := range strings.Split(relative, "/") {
		if part == "" || part == "." || part == ".." {
			return ""
		}
	}
	if !workspaceOwnsStorage(relative, workspace, production) {
		return ""
	}
	return "local:" + relative
}

func workspaceOwnsStorage(relative, workspace string, production bool) bool {
	clean := strings.TrimLeft(relative, "/")
	if clean == workspace || strings.HasPrefix(clean, workspace+"/") {
		return true
	}
	if production || workspace != "local" {
		return false
	}
	first := strings.Split(clean, "/")[0]
	if first == "official" || first == "legacy" || isHex64(first) {
		return false
	}
	return true
}

func isHex64(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, char := range value {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}

func hasKey(values map[string]struct{}, key string) bool {
	_, ok := values[key]
	return ok
}
