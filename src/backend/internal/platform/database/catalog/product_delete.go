package catalog

import (
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"database/sql"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func DeleteProduct(ctx context.Context, db *sql.DB, workspace, id, storageRoot string) error {
	var pic, details sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "picUrl", "detailUrls" FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&pic, &details)
	if err == sql.ErrNoRows {
		return ErrProductMissing
	}
	if err != nil {
		return err
	}
	removeLocalProductMedia(storageRoot, productMediaURLs(database.NullText(pic), database.NullText(details)))
	result, err := db.ExecContext(ctx, `DELETE FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace)
	if err != nil {
		return err
	}
	deleted, _ := result.RowsAffected()
	if deleted != 1 {
		return ErrProductMissing
	}
	return nil
}

func productMediaURLs(pic, details any) []string {
	urls := []string{}
	if text, ok := pic.(string); ok && text != "" {
		urls = append(urls, text)
	}
	raw, ok := details.(string)
	if !ok || raw == "" {
		return urls
	}
	var parsed []any
	if json.Unmarshal([]byte(raw), &parsed) != nil {
		return urls
	}
	for _, item := range parsed {
		if text, ok := item.(string); ok && text != "" {
			urls = append(urls, text)
		}
	}
	return urls
}

func removeLocalProductMedia(root string, urls []string) {
	for _, raw := range urls {
		target := deletableStorageFile(root, raw)
		if target == "" {
			continue
		}
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			continue
		}
	}
}

func deletableStorageFile(root, raw string) string {
	if strings.TrimSpace(root) == "" || !strings.HasPrefix(raw, "/storage/azhuo/") {
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
	if err != nil || strings.Contains(relative, "\\") || strings.Contains(relative, "\x00") {
		return ""
	}
	segments := strings.Split(relative, "/")
	for _, segment := range segments {
		if segment == "" || segment == ".." || segment == "." {
			return ""
		}
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return ""
	}
	current := realRoot
	for _, segment := range segments {
		current = filepath.Join(current, segment)
		info, err := os.Lstat(current)
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return ""
		}
	}
	info, err := os.Lstat(current)
	if err != nil || !info.Mode().IsRegular() {
		return ""
	}
	within, err := filepath.Rel(realRoot, current)
	if err != nil || within == "." || strings.HasPrefix(within, "..") || filepath.IsAbs(within) {
		return ""
	}
	return current
}
