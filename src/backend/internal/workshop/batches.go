package workshop

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dbworkshop "beike.local/cloud/src/backend/internal/platform/database/workshop"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var batchIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,128}$`)

func Batches(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		active, err := dbworkshop.EnsureActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		rows, err := dbworkshop.ListWorkshopBatches(r.Context(), db, httpx.WorkspaceFrom(r))
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
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "batches": batches, "canvasProjects": true})
	})
}

func ActiveBatch(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := dbworkshop.EnsureActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := dbworkshop.GetWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id)
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
		row, status, message, code := replaceBatch(cfg, r, func(db *sql.DB) (dbworkshop.WorkshopBatchRow, error) {
			return dbworkshop.DuplicateWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id)
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
		row, status, message, code := replaceBatch(cfg, r, func(db *sql.DB) (dbworkshop.WorkshopBatchRow, error) {
			return dbworkshop.ArchiveActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), force)
		})
		if status != 0 {
			writeFail(w, status, message, code)
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "batch": batchPayload(row)})
	})
}

func replaceBatch(cfg config.Config, r *http.Request, run func(*sql.DB) (dbworkshop.WorkshopBatchRow, error)) (dbworkshop.WorkshopBatchRow, int, string, string) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return dbworkshop.WorkshopBatchRow{}, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error"
	}
	defer db.Close()
	row, err := run(db)
	if errors.Is(err, dbworkshop.ErrBatchMissing) {
		return dbworkshop.WorkshopBatchRow{}, http.StatusNotFound, "批次不存在或已删除", "not_found"
	}
	if err != nil {
		return dbworkshop.WorkshopBatchRow{}, http.StatusConflict, err.Error(), "conflict"
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
		if len(bytes.TrimSpace(body)) > 0 && json.Unmarshal(body, &payload) != nil {
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		var row dbworkshop.WorkshopBatchRow
		if project, exists := payload["canvasProjectId"]; exists {
			projectID, valid := project.(string)
			sourceID, _ := payload["sourceBatchId"].(string)
			if !valid || !batchIDPattern.MatchString(projectID) || (sourceID != "" && !batchIDPattern.MatchString(sourceID)) {
				writeFail(w, 400, "画布项目或原草稿标识不正确", "bad_request")
				return
			}
			row, err = dbworkshop.CreateCanvasWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), projectID, sourceID, name)
		} else {
			row, err = dbworkshop.CreateWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), name, named)
		}
		if err != nil {
			writeFail(w, http.StatusConflict, err.Error(), "conflict")
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, map[string]any{"success": true, "batch": batchPayload(row)})
	})
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		next, updatedAt, err := dbworkshop.WriteWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id, revision, string(encoded), batchStatus(snapshot))
		if err != nil {
			if errors.Is(err, dbworkshop.ErrBatchMissing) {
				writeFail(w, http.StatusNotFound, "批次不存在或已删除", "not_found")
				return
			}
			if errors.Is(err, dbworkshop.ErrBatchConflict) {
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
		return "generating"
	}
	if stage >= 4 {
		return "completed"
	}
	return "collecting"
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		row, err := dbworkshop.RenameWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r), id, name)
		if errors.Is(err, dbworkshop.ErrBatchMissing) {
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
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
			return
		}
		defer db.Close()
		var deleted int64
		if clear {
			active, err := dbworkshop.EnsureActiveWorkshopBatch(r.Context(), db, httpx.WorkspaceFrom(r))
			if err != nil {
				writeFail(w, http.StatusInternalServerError, "批次操作失败，请检查本地服务后重试", "internal_error")
				return
			}
			deleted, err = dbworkshop.ClearWorkshopHistory(r.Context(), db, httpx.WorkspaceFrom(r), active.ID)
			if errors.Is(err, dbworkshop.ErrBatchConflict) {
				writeFail(w, http.StatusConflict, "当前批次已在其他窗口切换，请刷新后再清空历史", "conflict")
				return
			}
		} else {
			id := r.PathValue("id")
			if !batchIDPattern.MatchString(id) {
				writeFail(w, http.StatusBadRequest, "批次标识不正确", "bad_request")
				return
			}
			deleted, err = dbworkshop.DeleteWorkshopHistory(r.Context(), db, httpx.WorkspaceFrom(r), id)
			if errors.Is(err, dbworkshop.ErrBatchConflict) {
				writeFail(w, http.StatusConflict, "当前批次不能在历史记录中删除", "conflict")
				return
			}
			if errors.Is(err, dbworkshop.ErrBatchMissing) {
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

func batchPayload(row dbworkshop.WorkshopBatchRow) map[string]any {
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

// History sends only labels, four preview URLs and counts, never full prompts or image data.
func summarizeBatch(row dbworkshop.WorkshopBatchRow) map[string]any {
	var snapshot struct {
		BatchInputText string `json:"batchInputText"`
		Items          []struct {
			Title                 string   `json:"title"`
			ItemID                string   `json:"itemId"`
			Status                string   `json:"status"`
			Selected              bool     `json:"selected"`
			CoverImage            string   `json:"coverImage"`
			SelectedProductImages []string `json:"selectedProductImages"`
			Tasks                 []struct {
				Status       string `json:"status"`
				ResultURL    string `json:"resultUrl"`
				ResultStatus string `json:"resultStatus"`
			} `json:"tasks"`
		} `json:"items"`
	}
	_ = json.Unmarshal([]byte(row.Snapshot), &snapshot)
	titles, ids, previews := []string{}, []string{}, []string{}
	ready, tasks, results, failed := 0, 0, 0, 0
	for _, item := range snapshot.Items {
		if title := strings.TrimSpace(item.Title); title != "" {
			titles = append(titles, title)
		}
		if id := strings.TrimSpace(item.ItemID); id != "" {
			ids = append(ids, id)
		}
		if item.Status == "success" && item.Selected {
			ready++
		}
		preview := ""
		for _, task := range item.Tasks {
			if task.ResultStatus == "superseded" {
				continue
			}
			tasks++
			if task.Status == "FAILURE" {
				failed++
			}
			if task.Status == "SUCCESS" && usableHistoryResult(task.ResultURL) {
				results++
				if preview == "" && durableHistoryImage(task.ResultURL) {
					preview = task.ResultURL
				}
			}
		}
		if preview == "" {
			for _, image := range append(append([]string{}, item.SelectedProductImages...), item.CoverImage) {
				if durableHistoryImage(image) {
					preview = image
					break
				}
			}
		}
		if preview != "" && len(previews) < 4 {
			previews = append(previews, preview)
		}
	}
	return map[string]any{
		"id": row.ID, "name": row.Name, "status": row.Status, "revision": row.Revision,
		"createdAt": row.CreatedAt, "updatedAt": row.UpdatedAt, "legacyRecovered": row.LegacyRecovered,
		"itemCount": len(snapshot.Items), "readyCount": ready, "taskCount": tasks,
		"hasInput": strings.TrimSpace(snapshot.BatchInputText) != "", "resultCount": results, "failedCount": failed, "productTitles": titles, "productIds": ids, "previewImages": previews,
	}
}

func durableHistoryImage(url string) bool {
	return strings.TrimSpace(url) != "" && !strings.HasPrefix(url, "blob:") && !strings.HasPrefix(url, "data:")
}

// Match the browser's usable-result rule for legacy short data URLs, without sending them as thumbnails.
func usableHistoryResult(url string) bool {
	return url != "" && !strings.HasPrefix(url, "blob:") && !(strings.HasPrefix(url, "data:") && len(url) > 800)
}

// Image submission keys start with the batch ID and content ID. A grid is
// submitted once even though its snapshot contains four delivery slices.
const workshopTaskSource = `
 SELECT t.id, b.name || ' · ' || COALESCE((
  SELECT json_extract(i.value,'$.title') FROM json_each(b.snapshotJson,'$.items') i
  WHERE instr(t.idempotencyKey,b.id||':'||json_extract(i.value,'$.id')||':')=1 LIMIT 1
 ),'配图'), 'image',
 CASE upper(t.status) WHEN 'SUCCESS' THEN 'completed' WHEN 'FAILURE' THEN 'failed' WHEN 'PENDING' THEN 'queued' WHEN 'SUBMISSION_UNKNOWN' THEN 'uncertain' WHEN 'IN_PROGRESS' THEN 'running' WHEN 'SUBMITTING' THEN 'running' WHEN 'CANCELED' THEN 'canceled' WHEN 'CANCELLED' THEN 'canceled' ELSE lower(t.status) END,
 t.createdAt,'',CASE WHEN upper(t.status) IN ('SUCCESS','FAILURE') THEN t.updatedAt ELSE '' END,
 COALESCE(t.model,''),COALESCE(t.taskId,''),b.name || ' · ' || b.id,COALESCE(t.failReason,''),'',COALESCE(t.resultUrl,'')
 FROM ImageTask t JOIN WorkshopBatch b ON b.workspaceId=t.workspaceId AND b.id=substr(t.idempotencyKey,1,instr(t.idempotencyKey,':')-1)
 WHERE t.workspaceId=?1 AND COALESCE(t.mediaType,'image')='image'
 UNION ALL
 SELECT legacy.recordKey, legacy.name, 'image',
 CASE WHEN max(legacy.uncertain)=1 THEN 'uncertain'
      WHEN max(legacy.state='IN_PROGRESS')=1 THEN 'running'
      WHEN max(legacy.state='FAILURE')=1 AND max(legacy.state='SUCCESS')=1 THEN 'partial'
      WHEN max(legacy.state='FAILURE')=1 THEN 'failed'
      WHEN min(legacy.state='SUCCESS')=1 THEN 'completed' ELSE 'queued' END,
 '', '', '', legacy.model, max(legacy.external), legacy.batchName, max(legacy.error),
 '批次快照', CASE WHEN count(*)=1 THEN max(legacy.result) ELSE '' END
 FROM (
 SELECT coalesce(nullif(json_extract(t.value,'$.gridTaskKey'),''), json_extract(t.value,'$.id')) AS recordKey,
 b.id AS batchId, b.name || ' · ' || b.id AS batchName, coalesce(json_extract(i.value,'$.title'),b.name) AS name,
 coalesce(json_extract(t.value,'$.learningContext.model'),'') AS model,
 coalesce(json_extract(t.value,'$.upstreamTaskId'),'') AS external,
 coalesce(json_extract(t.value,'$.error'),'') AS error, coalesce(json_extract(t.value,'$.resultUrl'),'') AS result,
 json_extract(t.value,'$.status') AS state, coalesce(json_extract(t.value,'$.recoveryRequired'),0) AS uncertain
 FROM WorkshopBatch b, json_each(b.snapshotJson,'$.items') i, json_each(i.value,'$.tasks') t
 WHERE b.workspaceId=?1 AND NOT EXISTS (
 SELECT 1 FROM ImageTask receipt WHERE receipt.workspaceId=b.workspaceId AND coalesce(receipt.mediaType,'image')='image'
 AND receipt.idempotencyKey=coalesce(nullif(json_extract(t.value,'$.gridTaskKey'),''),json_extract(t.value,'$.idempotencyKey'))
 AND instr(receipt.idempotencyKey,b.id||':')=1)
 ) legacy GROUP BY legacy.batchId,legacy.recordKey
 UNION ALL
 SELECT r.id,b.name,r.kind,CASE r.status WHEN 'partial_failed' THEN 'partial' WHEN 'cancelled' THEN 'canceled' ELSE r.status END,
 r.createdAt,COALESCE(r.startedAt,''),COALESCE(r.finishedAt,''),'','',b.name || ' · ' || b.id,COALESCE(r.errorSummary,''),
 CASE WHEN r.totalTasks>0 THEN printf('%d/%d',r.completedTasks,r.totalTasks) ELSE '' END,''
 FROM WorkshopPipelineRun r JOIN WorkshopBatch b ON b.id=r.batchId AND b.workspaceId=r.workspaceId WHERE r.workspaceId=?1
 UNION ALL
 SELECT json_extract(r.value,'$.id'),b.name,json_extract(r.value,'$.kind'),
 CASE json_extract(r.value,'$.status') WHEN 'partial_failed' THEN 'partial' WHEN 'cancelled' THEN 'canceled' ELSE json_extract(r.value,'$.status') END,
 coalesce(json_extract(r.value,'$.startedAt'),''),coalesce(json_extract(r.value,'$.startedAt'),''),
 coalesce(json_extract(r.value,'$.finishedAt'),''),'','',b.name || ' · ' || b.id,coalesce(json_extract(r.value,'$.errorSummary'),''),
 CASE WHEN json_extract(r.value,'$.totalTasks')>0 THEN printf('%d/%d',json_extract(r.value,'$.completedTasks'),json_extract(r.value,'$.totalTasks')) ELSE '' END,''
 FROM WorkshopBatch b,json_each(b.snapshotJson,'$.pipeline.runs') r
 WHERE b.workspaceId=?1 AND NOT EXISTS(SELECT 1 FROM WorkshopPipelineRun stored WHERE stored.workspaceId=?1 AND stored.id=json_extract(r.value,'$.id'))`

func TaskRecords(cfg config.Config) http.HandlerFunc {
	return taskrecords.Handler(cfg, workshopTaskSource, nil)
}

func WorkspaceGet(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")
		if mode != "original" {
			writeFail(w, http.StatusBadRequest, "无效的电商图文模式", "bad_request")
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		defer db.Close()
		row, err := dbworkshop.ReadWorkshopWorkspace(r.Context(), db, httpx.WorkspaceFrom(r), mode)
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		if row.Empty {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": 0, "snapshot": nil, "updatedAt": nil})
			return
		}
		var snapshot map[string]any
		if json.Unmarshal([]byte(row.Snapshot), &snapshot) != nil {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		if message := prepareSnapshot(snapshot, mode); message != "" {
			writeFail(w, http.StatusInternalServerError, "工作区读取失败，已保留原记录，请检查本地服务", "internal_error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": row.Revision, "snapshot": snapshot, "updatedAt": row.UpdatedAt})
	})
}

func WorkspacePut(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("mode")
		if mode != "original" {
			writeFail(w, http.StatusBadRequest, "无效的电商图文模式", "bad_request")
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20+1))
		if err != nil {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		if len(body) > 8<<20 {
			writeFail(w, http.StatusRequestEntityTooLarge, "工作区超过 8 MB，请减少内嵌图片后保存", "payload_too_large")
			return
		}
		var payload map[string]any
		if json.Unmarshal(body, &payload) != nil {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		revision, ok := whole(payload["revision"])
		snapshot, snapshotOK := payload["snapshot"].(map[string]any)
		if !ok || revision < 0 || !snapshotOK {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		if message := prepareSnapshot(snapshot, mode); message != "" {
			status := http.StatusBadRequest
			if message == "工作区模式不一致" {
				writeFail(w, status, message, "bad_request")
				return
			}
			writeFail(w, status, "工作区格式不正确", "bad_request")
			return
		}
		encoded, err := json.Marshal(snapshot)
		if err != nil {
			writeFail(w, http.StatusBadRequest, "工作区格式不正确", "bad_request")
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区保存失败，请重试", "internal_error")
			return
		}
		defer db.Close()
		updatedAt := time.Now().UTC().Format(time.RFC3339Nano)
		next, err := dbworkshop.WriteWorkshopWorkspace(r.Context(), db, httpx.WorkspaceFrom(r), mode, revision, string(encoded), updatedAt)
		if errors.Is(err, dbworkshop.ErrWorkspaceConflict) {
			writeFail(w, http.StatusConflict, err.Error(), "conflict")
			return
		}
		if err != nil {
			writeFail(w, http.StatusInternalServerError, "工作区保存失败，请重试", "internal_error")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "revision": next, "updatedAt": updatedAt})
	})
}

func writeFail(w http.ResponseWriter, status int, message, code string) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message, "code": code})
}
