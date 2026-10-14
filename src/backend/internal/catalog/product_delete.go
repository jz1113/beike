package catalog

import (
	dbcatalog "beike.local/cloud/src/backend/internal/platform/database/catalog"
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func productsDeleteHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "缺少 id 参数"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		deleteRemoteProductMedia(r.Context(), db, httpx.WorkspaceFrom(r), id)
		if err := dbcatalog.DeleteProduct(r.Context(), db, httpx.WorkspaceFrom(r), id, productStorageRoot(cfg)); err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "操作失败，请稍后重试"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true})
	}
}

func deleteRemoteProductMedia(ctx context.Context, db *sql.DB, workspace, id string) {
	config := storage.ResolveObjectConfig(nil)
	if config == nil || !config.Enabled {
		return
	}
	var pic, details sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT "picUrl", "detailUrls" FROM "Product" WHERE "id" = ? AND "workspaceId" = ?`, id, workspace).Scan(&pic, &details)
	if err != nil {
		return
	}
	for _, raw := range productMediaList(nullText(pic), nullText(details)) {
		key := storage.ManagedKey(raw, config)
		if key == "" {
			continue
		}
		if err := storage.Objects.Delete(ctx, *config, key); err != nil {
			log.Printf("[删除商品-OSS清理异常] %s: %v", key, err)
		}
	}
}

func nullText(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func productMediaList(pic, details string) []string {
	urls := []string{}
	if pic != "" {
		urls = append(urls, pic)
	}
	if details == "" {
		return urls
	}
	var parsed []any
	if json.Unmarshal([]byte(details), &parsed) != nil {
		return urls
	}
	for _, item := range parsed {
		if text, ok := item.(string); ok && text != "" {
			urls = append(urls, text)
		}
	}
	return urls
}

func productStorageRoot(cfg config.Config) string {
	if dir := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR")); dir != "" {
		return dir
	}
	if dir := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); dir != "" {
		return filepath.Join(dir, "storage")
	}
	if path := cfg.SQLiteFile(); path != "" {
		return filepath.Join(filepath.Dir(path), "storage")
	}
	return ""
}
