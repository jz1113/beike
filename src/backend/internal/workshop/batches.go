package workshop

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

var batchIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

func Batches(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		active, err := database.EnsureActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		rows, err := database.ListWorkshopBatches(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		batches := []map[string]any{}
		for _, row := range rows {
			summary := summarizeBatch(row)
			if row.ID == active.ID || summary["itemCount"].(int) > 0 || row.Status == "archived" {
				batches = append(batches, summary)
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "batches": batches})
	})
}

func ActiveBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := database.EnsureActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func Batch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !batchIDPattern.MatchString(id) {
			writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := database.GetWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id)
		if err != nil || row.ID == "" {
			writeFail(w, http.StatusNotFound, "批次不存在或已删除", "not_found")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func DuplicateBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !batchIDPattern.MatchString(id) {
			writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
			return
		}
		row, status, message, code := replaceBatch(cfg, r, func(db *sql.DB) (database.WorkshopBatchRow, error) {
			return database.DuplicateWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id)
		})
		if status != 0 {
			writeFail(w, status, message, code)
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func ArchiveBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		payload := map[string]any{}
		_ = json.Unmarshal(body, &payload)
		force, _ := payload["force"].(bool)
		row, status, message, code := replaceBatch(cfg, r, func(db *sql.DB) (database.WorkshopBatchRow, error) {
			return database.ArchiveActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), force)
		})
		if status != 0 {
			writeFail(w, status, message, code)
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func replaceBatch(cfg config.Config, r *http.Request, run func(*sql.DB) (database.WorkshopBatchRow, error)) (database.WorkshopBatchRow, int, string, string) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return database.WorkshopBatchRow{}, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error"
	}
	defer db.Close()
	row, err := run(db)
	if errors.Is(err, database.ErrBatchMissing) {
		return database.WorkshopBatchRow{}, http.StatusNotFound, "批次不存在或已删除", "not_found"
	}
	if err != nil {
		return database.WorkshopBatchRow{}, http.StatusConflict, err.Error(), "conflict"
	}
	return row, 0, "", ""
}

func CreateBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "新建批次参数不正确", "bad_request")
			return
		}
		payload := map[string]any{}
		if len(bytesTrim(body)) > 0 && json.Unmarshal(body, &payload) != nil {
			writeFail(w, http.StatusBadRequest, "新建批次参数不正确", "bad_request")
			return
		}
		name, named := payload["name"].(string)
		name = strings.TrimSpace(name)
		if named && (name == "" || utf8.RuneCountInString(name) > 120) {
			writeFail(w, http.StatusBadRequest, "新建批次参数不正确", "bad_request")
			return
		}
		if _, exists := payload["name"]; exists && name == "" {
			writeFail(w, http.StatusBadRequest, "新建批次参数不正确", "bad_request")
			return
		}
		named = name != ""
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := database.CreateWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), name, named)
		if err != nil {
			writeFail(w, http.StatusConflict, err.Error(), "conflict")
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func bytesTrim(body []byte) []byte {
	return bytesTrimSpace(body)
}

func bytesTrimSpace(body []byte) []byte {
	return []byte(strings.TrimSpace(string(body)))
}

func SaveBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !batchIDPattern.MatchString(id) {
			writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20+1))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "批次内容格式不正确", "bad_request")
			return
		}
		if len(body) > 8<<20 {
			writeFail(w, http.StatusRequestEntityTooLarge, "当前批次超过 8 MB，请减少内嵌图片后保存", "payload_too_large")
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeFail(w, http.StatusBadRequest, "批次内容格式不正确", "bad_request")
			return
		}
		revision, ok := whole(payload["revision"])
		snapshot, snapshotOK := payload["snapshot"].(map[string]any)
		if !ok || revision < 1 || !snapshotOK {
			writeFail(w, http.StatusBadRequest, "批次内容格式不正确", "bad_request")
			return
		}
		encoded, err := json.Marshal(snapshot)
		if err != nil {
			writeFail(w, http.StatusBadRequest, "批次内容格式不正确", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		next, updatedAt, err := database.WriteWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id, revision, string(encoded), batchStatus(snapshot))
		if err != nil {
			if errors.Is(err, database.ErrBatchMissing) {
				writeFail(w, http.StatusNotFound, "批次不存在或已删除", "not_found")
				return
			}
			if errors.Is(err, database.ErrBatchConflict) {
				writeFail(w, http.StatusConflict, err.Error(), "conflict")
				return
			}
			writeFail(w, http.StatusConflict, err.Error(), "conflict")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": next, "updatedAt": updatedAt})
	})
}

func batchStatus(snapshot map[string]any) string {
	if pipeline, ok := snapshot["pipeline"].(map[string]any); ok {
		if status, ok := pipeline["status"].(string); ok && status != "" {
			return status
		}
	}
	items, _ := snapshot["items"].([]any)
	if len(items) == 0 {
		return "draft"
	}
	stage, ok := whole(snapshot["currentStage"])
	if ok && stage == 1 {
		return "collecting"
	}
	if stage == 2 {
		return "plan_ready"
	}
	if stage == 3 {
		return "review_required"
	}
	return "generating"
}

func RenameBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !batchIDPattern.MatchString(id) {
			writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "批次名称不能为空，且不能超过 120 个字符", "bad_request")
			return
		}
		var payload map[string]any
		name, _ := payload["name"].(string)
		if json.Unmarshal(body, &payload) == nil {
			name, _ = payload["name"].(string)
		}
		name = strings.TrimSpace(name)
		if name == "" || utf8.RuneCountInString(name) > 120 {
			writeFail(w, http.StatusBadRequest, "批次名称不能为空，且不能超过 120 个字符", "bad_request")
			return
		}
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := database.RenameWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id, name)
		if errors.Is(err, database.ErrBatchMissing) {
			writeFail(w, http.StatusNotFound, "批次不存在或已删除", "not_found")
			return
		}
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func DeleteBatch(cfg config.Config) http.Handler {
	return historyHandler(cfg, false)
}

func ClearBatchHistory(cfg config.Config) http.Handler {
	return historyHandler(cfg, true)
}

func historyHandler(cfg config.Config, clear bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := httpx.OpenDB(cfg)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		var deleted int64
		if clear {
			active, err := database.EnsureActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
			if err != nil {
				writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
				return
			}
			deleted, err = database.ClearWorkshopHistory(r.Context(), db, httpx.WorkspaceFrom(r), active.ID)
			if errors.Is(err, database.ErrBatchConflict) {
				writeFail(w, http.StatusConflict, "当前批次已在其他窗口切换，请刷新后再清空历史", "conflict")
				return
			}
		} else {
			id := r.PathValue("id")
			if !batchIDPattern.MatchString(id) {
				writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
				return
			}
			deleted, err = database.DeleteWorkshopHistory(r.Context(), db, httpx.WorkspaceFrom(r), id)
			if errors.Is(err, database.ErrBatchConflict) {
				writeFail(w, http.StatusConflict, "当前批次不能在历史记录中删除", "conflict")
				return
			}
			if errors.Is(err, database.ErrBatchMissing) {
				writeFail(w, http.StatusNotFound, "批次不存在或已删除", "not_found")
				return
			}
		}
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "deleted": deleted})
	})
}

func summarizeBatch(row database.WorkshopBatchRow) map[string]any {
	items, ready, tasks := batchCounts(row.Snapshot)
	return map[string]any{
		"id": row.ID, "name": row.Name, "status": row.Status, "revision": row.Revision,
		"createdAt": row.CreatedAt, "updatedAt": row.UpdatedAt, "legacyRecovered": row.LegacyRecovered,
		"itemCount": items, "readyCount": ready, "taskCount": tasks,
	}
}

func batchPayload(row database.WorkshopBatchRow) map[string]any {
	var snapshot any
	if json.Unmarshal([]byte(row.Snapshot), &snapshot) != nil {
		snapshot = map[string]any{}
	}
	return map[string]any{
		"id": row.ID, "name": row.Name, "status": row.Status, "revision": row.Revision,
		"createdAt": row.CreatedAt, "updatedAt": row.UpdatedAt, "legacyRecovered": row.LegacyRecovered,
		"snapshot": snapshot,
	}
}

func batchCounts(raw string) (int, int, int) {
	var snapshot map[string]any
	if json.Unmarshal([]byte(raw), &snapshot) != nil {
		return 0, 0, 0
	}
	items, _ := snapshot["items"].([]any)
	ready := 0
	tasks := 0
	for _, item := range items {
		product, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if product["status"] == "success" && product["selected"] == true {
			ready++
		}
		if list, ok := product["tasks"].([]any); ok {
			tasks += len(list)
		}
	}
	return len(items), ready, tasks
}
