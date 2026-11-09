package assets

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func uploadWithObjectStore(ctx context.Context, contentType, headerConfig string, raw []byte) ([]string, bool) {
	custom := uploadCustomConfig(contentType, raw)
	if custom == nil && strings.TrimSpace(headerConfig) != "" {
		custom = parseConfig(headerConfig)
	}
	config := storage.ResolveObjectConfig(custom)
	if config == nil || !config.Enabled || !config.PersistResults {
		return nil, false
	}
	urls, err := putUploadedObjects(ctx, *config, contentType, raw)
	if err != nil || len(urls) == 0 {
		return nil, false
	}
	return urls, true
}

func putUploadedObjects(ctx context.Context, config storage.ObjectConfig, contentType string, raw []byte) ([]string, error) {
	if strings.Contains(contentType, "multipart/form-data") {
		return putMultipartObjects(ctx, config, contentType, raw)
	}
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil {
		return nil, osErrInvalid()
	}
	category, _ := payload["category"].(string)
	values := []string{}
	if text, ok := payload["dataUrl"].(string); ok && text != "" {
		values = append(values, text)
	}
	if list, ok := payload["dataUrls"].([]any); ok {
		for _, item := range list {
			if text, ok := item.(string); ok && text != "" {
				values = append(values, text)
			}
		}
	}
	urls := []string{}
	for _, value := range values {
		mimeType, body, err := parseDataURL(value)
		if err != nil {
			return nil, osErrInvalid()
		}
		url, err := putObjectBytes(ctx, config, body, mimeType, category, "")
		if err != nil {
			return nil, err
		}
		urls = append(urls, url)
	}
	return urls, nil
}

func putMultipartObjects(ctx context.Context, config storage.ObjectConfig, contentType string, raw []byte) ([]string, error) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return nil, err
	}
	form, err := multipart.NewReader(bytes.NewReader(raw), params["boundary"]).ReadForm(32 << 20)
	if err != nil {
		return nil, err
	}
	defer form.RemoveAll()
	category := "generated/images"
	if values := form.Value["category"]; len(values) > 0 && values[0] != "" {
		category = values[0]
	}
	urls := []string{}
	for _, files := range form.File {
		for _, file := range files {
			opened, err := file.Open()
			if err != nil {
				return nil, err
			}
			body, err := io.ReadAll(opened)
			opened.Close()
			if err != nil {
				return nil, err
			}
			mimeType := sniffUploadContentType(file.Header.Get("Content-Type"), file.Filename, body)
			url, err := putObjectBytes(ctx, config, body, mimeType, category, storedFilename(mimeType, file.Filename))
			if err != nil {
				return nil, err
			}
			urls = append(urls, url)
		}
	}
	return urls, nil
}

func putObjectBytes(ctx context.Context, config storage.ObjectConfig, body []byte, contentType, category, filename string) (string, error) {
	ext := localExtension(contentType, filename)
	if category == "" {
		category = "generated/images"
		if strings.Contains(contentType, "video") {
			category = "generated/videos"
		}
	}
	key := storage.ObjectKeyWithConfig(config, category, ext, filename)
	if err := storage.Objects.Put(ctx, config, key, contentType, body); err != nil {
		return "", err
	}
	return storage.PermanentObjectURL(config, key), nil
}

func uploadCustomConfig(contentType string, raw []byte) map[string]any {
	if strings.Contains(contentType, "multipart/form-data") {
		_, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			return nil
		}
		form, err := multipart.NewReader(bytes.NewReader(raw), params["boundary"]).ReadForm(1 << 20)
		if err != nil {
			return nil
		}
		defer form.RemoveAll()
		if values := form.Value["customConfig"]; len(values) > 0 {
			return parseConfig(values[0])
		}
		return nil
	}
	var payload map[string]any
	if json.Unmarshal(raw, &payload) != nil {
		return nil
	}
	custom, _ := payload["customConfig"].(map[string]any)
	return custom
}

func osErrInvalid() error { return errInvalidDataURL }

type invalidDataURL struct{}

func (invalidDataURL) Error() string { return "无效的 data URL" }

var errInvalidDataURL invalidDataURL

func probeObjectConfig(config map[string]any) *storage.ObjectConfig {
	if config == nil {
		config = map[string]any{}
	}
	cloned := map[string]any{}
	for key, value := range config {
		cloned[key] = value
	}
	cloned["persistResults"] = false
	return storage.ResolveObjectConfig(cloned)
}

func storageMigrateHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !storageAdmin(cfg, r) {
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"success": false, "error": "需要管理员权限"})
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
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
	tasks, err := dbworkshop.ListMigrationTasks(ctx, db, workspace, cursor, limit+1)
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
		if err := dbworkshop.UpdateTaskResultURL(ctx, db, workspace, task.ID, permanent); err != nil {
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
