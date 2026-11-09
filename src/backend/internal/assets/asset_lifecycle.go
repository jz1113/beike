package assets

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func assetLifecycleHandler(cfg config.Config, action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		assetType := r.PathValue("type")
		if !validAssetType(assetType) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false, "error": "资产类型或操作不正确", "code": "bad_request",
			})
			return
		}
		reason := "人工停用"
		if action == "disable" {
			parsed, ok := readDisableReason(r)
			if !ok {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
					"success": false, "error": "资产生命周期操作失败", "code": "bad_request",
				})
				return
			}
			reason = parsed
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false, "error": "资产生命周期操作失败", "code": "bad_request",
			})
			return
		}
		defer db.Close()
		registry, err := dblibrary.ApplyAssetLifecycle(r.Context(), db, httpx.WorkspaceFrom(r), assetType, r.PathValue("id"), action, reason)
		if err != nil {
			var lifecycle *dblibrary.LifecycleError
			if errors.As(err, &lifecycle) {
				httpx.WriteJSON(w, lifecycle.Status, map[string]any{
					"success": false, "error": lifecycle.Message, "code": lifecycle.Code,
				})
				return
			}
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"success": false, "error": "资产生命周期操作失败", "code": "bad_request",
			})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "registry": registry})
	}
}

func readDisableReason(r *http.Request) (string, bool) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return "", false
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return "人工停用", true
	}
	var payload map[string]json.RawMessage
	if json.Unmarshal(body, &payload) != nil {
		return "人工停用", true
	}
	raw, ok := payload["reason"]
	if !ok {
		return "人工停用", true
	}
	if string(raw) == "null" {
		return "", false
	}
	var reason string
	if json.Unmarshal(raw, &reason) != nil || len([]rune(reason)) > 500 {
		return "", false
	}
	if reason == "" {
		return "人工停用", true
	}
	return reason, true
}

func assetPerformanceHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		assetType := r.PathValue("type")
		if !validAssetType(assetType) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "资产类型不正确", "code": "bad_request"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "服务器内部错误", "code": "internal_error"})
			return
		}
		defer db.Close()
		performance, err := dblibrary.ReadAssetPerformance(r.Context(), db, httpx.WorkspaceFrom(r), r.PathValue("id"))
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "服务器内部错误", "code": "internal_error"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success": true, "assetType": assetType, "assetId": r.PathValue("id"),
			"counts": performance.Counts, "firstPassAcceptRate": performance.FirstPassAcceptRate,
			"retryRate": performance.RetryRate, "quality": performance.Quality,
		})
	}
}

func validAssetType(value string) bool {
	switch value {
	case "scene", "outfit", "action", "persona", "full_prompt":
		return true
	default:
		return false
	}
}

func assetTasksHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败"})
			return
		}
		defer db.Close()
		if id := r.URL.Query().Get("id"); id != "" {
			task, ok, err := dbworkshop.FindImageTask(r.Context(), db, httpx.WorkspaceFrom(r), id)
			if err != nil {
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败"})
				return
			}
			if !ok {
				httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "任务不存在"})
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "task": task})
			return
		}
		page := boundedInt(httpx.QueryInt(r, "page", 1), 1, 1_000_000)
		pageSize := boundedInt(httpx.QueryInt(r, "pageSize", 100), 1, 200)
		total, tasks, err := dbworkshop.ListImageTasks(r.Context(), db, httpx.WorkspaceFrom(r), dbworkshop.TaskQuery{
			ProductID: r.URL.Query().Get("productId"),
			Status:    r.URL.Query().Get("status"),
			Search:    r.URL.Query().Get("search"),
			Detail:    r.URL.Query().Get("detail") == "true" || r.URL.Query().Get("detail") == "1",
			Page:      page,
			PageSize:  pageSize,
		})
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "获取任务失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "page": page, "pageSize": pageSize, "total": total, "tasks": tasks})
	}
}

func boundedInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

// CleanupAssistantMedia removes expired assistant attachments under the storage root.
func CleanupAssistantMedia(now time.Time) {
	root := storage.ResolveRoot()
	directories := []string{filepath.Join(root, "assistant-attachments")}
	entries, _ := os.ReadDir(root)
	for _, entry := range entries {
		if entry.IsDir() {
			directories = append(directories, filepath.Join(root, entry.Name(), "assistant-attachments"))
		}
	}
	for _, directory := range directories {
		files, _ := os.ReadDir(directory)
		for _, file := range files {
			if file.IsDir() {
				continue
			}
			match := attachmentExpiryPattern.FindStringSubmatch("assistant-attachments/" + file.Name())
			if match == nil {
				continue
			}
			expires, err := strconv.ParseInt(match[1], 10, 64)
			if err != nil || expires > now.UnixMilli() {
				continue
			}
			_ = os.Remove(filepath.Join(directory, file.Name()))
		}
	}
}

func StorageStats(cfg config.Config) http.Handler { return storageStatsHandler(cfg) }
func ClearDerived(cfg config.Config) http.Handler { return clearDerivedStorageHandler(cfg) }
func Upload(cfg config.Config) http.Handler       { return storageUploadHandler(cfg) }
func TestStorage(cfg config.Config) http.Handler  { return storageTestHandler(cfg) }
func Migrate(cfg config.Config) http.Handler      { return storageMigrateHandler(cfg) }
func Tasks(cfg config.Config) http.Handler        { return assetTasksHandler(cfg) }
func DeleteTasks(cfg config.Config) http.Handler  { return assetTasksDeleteHandler(cfg) }
func Performance(cfg config.Config) http.Handler  { return assetPerformanceHandler(cfg) }
func Lifecycle(cfg config.Config, action string) http.Handler {
	return assetLifecycleHandler(cfg, action)
}
func Storage(cfg config.Config) http.Handler { return storageHandler(cfg) }

func assetTasksDeleteHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20+1))
		if err != nil || len(body) > 1<<20 {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		object := map[string]any{}
		if len(strings.TrimSpace(string(body))) > 0 && json.Unmarshal(body, &object) != nil {
			object = map[string]any{}
		}
		clearAll := r.URL.Query().Get("clearAll") == "true" || object["clearAll"] == true
		clearFailed := r.URL.Query().Get("clearFailed") == "true" || object["clearFailed"] == true
		if clearAll && !taskAdminAuthorized(r, cfg) {
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"success": false, "error": "clearAll requires admin token"})
			return
		}
		selection := dbworkshop.TaskRemovalSelection{All: clearAll, Failed: !clearAll && clearFailed}
		if !selection.All && !selection.Failed {
			selection.IDs = uniqueTaskValues(r.URL.Query().Get("id"), r.URL.Query().Get("ids"), object["id"], object["ids"])
			selection.URLs = uniqueTaskValues(r.URL.Query().Get("url"), r.URL.Query().Get("urls"), object["url"], object["urls"])
			if len(selection.IDs) == 0 && len(selection.URLs) == 0 {
				httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少待删除的任务 ID 或 URL"})
				return
			}
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		defer db.Close()
		result, err := dbworkshop.RemoveImageTasks(r.Context(), db, httpx.WorkspaceFrom(r), selection, stringList(object["protectUrls"]), cfg.MediaReviewRoot(), cfg.Production())
		if err != nil {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "操作失败，请稍后重试"})
			return
		}
		payload := map[string]any{"success": true, "count": result.Count, "mediaCleanup": result.MediaCleanup}
		if result.Warning != "" {
			payload["warning"] = result.Warning
		}
		httpx.WriteJSON(w, http.StatusOK, payload)
	}
}

func taskAdminAuthorized(r *http.Request, cfg config.Config) bool {
	if !cfg.Production() {
		return true
	}
	return httpx.TokenMatches(httpx.RequestToken(r), cfg.AdminToken)
}

func uniqueTaskValues(single, csv string, bodySingle, bodyMany any) []string {
	values := []string{}
	seen := map[string]struct{}{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	add(single)
	for _, part := range strings.Split(csv, ",") {
		add(part)
	}
	if text, ok := bodySingle.(string); ok {
		add(text)
	}
	for _, item := range stringList(bodyMany) {
		add(item)
	}
	return values
}

func stringList(value any) []string {
	list, ok := value.([]any)
	if !ok {
		return nil
	}
	values := []string{}
	for _, item := range list {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			values = append(values, strings.TrimSpace(text))
		}
	}
	return values
}
