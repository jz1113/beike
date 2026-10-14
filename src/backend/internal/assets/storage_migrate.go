package assets

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func storageMigrateHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !storageAdmin(cfg, r) {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"success": false, "error": "需要管理员权限"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil || (len(bytes.TrimSpace(raw)) > 0 && !json.Valid(raw)) {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "批量迁移执行失败"})
			return
		}
		var payload map[string]any
		if len(bytes.TrimSpace(raw)) > 0 && json.Unmarshal(raw, &payload) != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "批量迁移执行失败"})
			return
		}
		configMap, _ := payload["config"].(map[string]any)
		if configMap == nil {
			configMap = payload
		}
		resolved := storage.ResolveObjectConfig(configMap)
		if resolved == nil || !resolved.Enabled {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "未配置有效的对象存储凭证，请先在设置中填写并开启存储配置"})
			return
		}
		if !resolved.PersistResults {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "未开启成品上传。开启后才会把历史文件转存到对象存储。"})
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "批量迁移执行失败"})
			return
		}
		defer db.Close()
		cursor, limit := migrationPage(payload)
		httpx.WriteJSON(w, http.StatusOK, migrateStoredTasks(r.Context(), db, httpx.WorkspaceFrom(r), *resolved, cursor, limit))
	}
}

func migrationPage(config map[string]any) (string, int) {
	limit := 100
	if value, ok := config["limit"].(float64); ok && value > 0 {
		limit = int(value)
	}
	if limit > 500 {
		limit = 500
	}
	if limit < 1 {
		limit = 1
	}
	cursor, _ := config["cursor"].(string)
	return cursor, limit
}

func migrateStoredTasks(ctx context.Context, db *sql.DB, workspace string, config storage.ObjectConfig, cursor string, limit int) map[string]any {
	tasks, err := database.ListMigrationTasks(ctx, db, workspace, cursor, limit+1)
	if err != nil {
		return map[string]any{"success": false, "error": "批量迁移执行失败"}
	}
	hasMore := len(tasks) > limit
	if hasMore {
		tasks = tasks[:limit]
	}
	migrated, failed := 0, 0
	errors := []string{}
	need := 0
	for _, task := range tasks {
		if task.ResultURL == "" || storage.AlreadyPermanent(task.ResultURL, config.PublicDomain) {
			continue
		}
		need++
		category := "generated/images"
		if task.MediaType == "video" || task.MediaType == "depth-video" || strings.Contains(task.ResultURL, ".mp4") {
			category = "generated/videos"
		}
		permanent, err := copyRemoteObject(ctx, config, task.ResultURL, category)
		if err != nil || permanent == "" {
			failed++
			label := task.TaskID
			if label == "" {
				label = task.ID
			}
			if len(errors) < 10 {
				errors = append(errors, "任务 "+label+" 迁移失败: 网络连接超时或凭证无效")
			}
			continue
		}
		if err := database.UpdateTaskResultURL(ctx, db, workspace, task.ID, permanent); err != nil {
			failed++
			continue
		}
		migrated++
	}
	message := "当前所有历史任务均为永久链接，无需迁移！"
	if need > 0 || hasMore {
		message = "本批迁移完成，成功转存 " + strconv.Itoa(migrated) + " 条，失败 " + strconv.Itoa(failed) + " 条"
	}
	body := map[string]any{
		"success": true, "message": message, "total": len(tasks), "needMigrate": need,
		"migrated": migrated, "failed": failed, "hasMore": hasMore, "errors": errors,
	}
	if hasMore && len(tasks) > 0 {
		body["nextCursor"] = tasks[len(tasks)-1].ID
	}
	return body
}

func copyRemoteObject(ctx context.Context, config storage.ObjectConfig, rawURL, category string) (string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	client := network.SafeClient()
	client.Timeout = 60 * time.Second
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", errInvalidDataURL
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 32<<20))
	if err != nil {
		return "", err
	}
	contentType := response.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
		if category == "generated/videos" {
			contentType = "video/mp4"
		}
	}
	return putObjectBytes(ctx, config, body, contentType, category, "")
}
