package library

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type liveDeconstructJob struct {
	stopping bool
	done     chan struct{}
}

var (
	deconstructJobsMu       sync.Mutex
	deconstructJobsLive     = map[string]*liveDeconstructJob{}
	deconstructJobsShutdown bool
)

func submitDeconstructJobs(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	deconstructJobsMu.Lock()
	shutting := deconstructJobsShutdown
	deconstructJobsMu.Unlock()
	if shutting {
		writeJobError(w, http.StatusServiceUnavailable, "服务正在关闭，请稍后重新提交并核对原任务", "server_shutting_down")
		return
	}
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		writeJobError(w, http.StatusBadRequest, "后台反推参数无效", "invalid_job_submission")
		return
	}
	baseURL, apiKey := deconstructCreds(cfg, r, payload)
	items, err := normalizeJobItems(payload["items"])
	if err != nil {
		writeJobError(w, http.StatusBadRequest, err.Error(), "invalid_job_image")
		return
	}
	concurrency := intValue(payload["concurrency"])
	if concurrency == 0 {
		concurrency = 4
	}
	reviewBefore, _ := payload["reviewBeforeSave"].(bool)
	configBody := map[string]any{
		"model": payload["model"], "userHint": payload["userHint"], "fallbackOrder": payload["fallbackOrder"],
		"concurrency": concurrency, "reviewBeforeSave": reviewBefore,
	}
	rawConfig, _ := json.Marshal(scrubJob(configBody, apiKey))
	hash := database.JobInputHash(items, configBody, baseURL)
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeJobError(w, http.StatusInternalServerError, "后台反推提交失败", "internal_error")
		return
	}
	defer db.Close()
	created, err := database.CreateDeconstructJob(r.Context(), db, httpx.WorkspaceFrom(r), jobStorageRoot(cfg), database.DeconstructJobCreate{
		JobID: stringValue(payload["jobId"]), InputHash: hash, ConfigJSON: string(rawConfig),
		Concurrency: concurrency, ReviewBeforeSave: reviewBefore, Items: jobRecords(items),
	})
	if err == database.ErrJobConflict {
		writeJobError(w, http.StatusConflict, "任务 ID 已对应另一批图集，请核对原任务", "job_input_conflict")
		return
	}
	if err == database.ErrJobCapacity {
		writeJobError(w, http.StatusConflict, "当前已有 5 个后台反推任务，请等待完成或停止后继续", "job_capacity_reached")
		return
	}
	if err != nil {
		writeJobError(w, http.StatusInternalServerError, "后台反推提交失败", "internal_error")
		return
	}
	if !created.Reused && !deconstructJobsShutdown {
		startDeconstructJob(cfg, httpx.WorkspaceFrom(r), stringValue(payload["jobId"]), items, configBody, baseURL, apiKey)
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{"success": true, "reused": created.Reused, "job": created.Job})
}

func stopDeconstructJobs(cfg config.Config, w http.ResponseWriter, r *http.Request, body []byte) {
	var payload struct {
		JobID string `json:"jobId"`
	}
	_ = json.Unmarshal(body, &payload)
	key := httpx.WorkspaceFrom(r) + ":" + payload.JobID
	deconstructJobsMu.Lock()
	if live := deconstructJobsLive[key]; live != nil {
		live.stopping = true
	}
	deconstructJobsMu.Unlock()
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		writeJobError(w, http.StatusInternalServerError, "后台反推提交失败", "internal_error")
		return
	}
	defer db.Close()
	if err := database.StopDeconstructJob(r.Context(), db, httpx.WorkspaceFrom(r), payload.JobID); err == database.ErrJobMissing {
		writeJobError(w, http.StatusNotFound, "后台反推任务不存在", "job_not_found")
		return
	} else if err != nil {
		writeJobError(w, http.StatusInternalServerError, "后台反推提交失败", "internal_error")
		return
	}
	job, _, err := database.GetDeconstructJob(r.Context(), db, httpx.WorkspaceFrom(r), jobStorageRoot(cfg), payload.JobID)
	if err != nil {
		writeJobError(w, http.StatusInternalServerError, "后台反推提交失败", "internal_error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "job": job})
}

func startDeconstructJob(cfg config.Config, workspace, jobID string, items []map[string]any, configBody map[string]any, baseURL, apiKey string) {
	key := workspace + ":" + jobID
	live := &liveDeconstructJob{done: make(chan struct{})}
	deconstructJobsMu.Lock()
	if deconstructJobsShutdown {
		deconstructJobsMu.Unlock()
		return
	}
	deconstructJobsLive[key] = live
	deconstructJobsMu.Unlock()
	go runDeconstructJob(cfg, workspace, key, live, jobID, len(items), configBody, baseURL, apiKey)
}

func runDeconstructJob(cfg config.Config, workspace, key string, live *liveDeconstructJob, jobID string, count int, configBody map[string]any, baseURL, apiKey string) {
	defer close(live.done)
	defer func() {
		deconstructJobsMu.Lock()
		delete(deconstructJobsLive, key)
		deconstructJobsMu.Unlock()
	}()
	workers := intValue(configBody["concurrency"])
	if workers < 1 {
		workers = 1
	}
	if workers > count {
		workers = count
	}
	var group sync.WaitGroup
	for i := 0; i < workers; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			deconstructWorker(cfg, workspace, live, jobID, configBody, baseURL, apiKey)
		}()
	}
	group.Wait()
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	_ = database.FinalizeDeconstructJob(context.Background(), db, workspace, jobID)
}

func deconstructWorker(cfg config.Config, workspace string, live *liveDeconstructJob, jobID string, configBody map[string]any, baseURL, apiKey string) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return
	}
	defer db.Close()
	for !live.stopping {
		claimed, err := database.ClaimDeconstructJobItem(context.Background(), db, workspace, jobID)
		if err != nil || claimed == nil {
			return
		}
		item := claimed.Input
		request, err := http.NewRequest(http.MethodPost, "http://background.local/deconstruct", nil)
		if err != nil {
			return
		}
		request = request.WithContext(httpx.WithWorkspace(request.Context(), workspace))
		payload := map[string]any{
			"imageUrls": item["images"], "albumName": item["name"], "userHint": jobHint(configBody, stringValue(item["name"])),
			"model": configBody["model"], "fallbackOrder": configBody["fallbackOrder"],
			"targetCategory": item["targetCategory"], "targetSubcategory": item["targetSubcategory"],
			"customBaseUrl": baseURL, "customApiKey": apiKey, "reviewBeforeSave": configBody["reviewBeforeSave"],
			"autoSave":     !boolValue(configBody["reviewBeforeSave"]),
			"clientTaskId": jobTaskID(jobID, claimed.ItemID),
		}
		status, body := executeDeconstruct(cfg, request, payload, deconstructHooks{
			beforeDispatch: func() (bool, error) {
				if live.stopping {
					return false, nil
				}
				return database.CommitDeconstructDispatch(context.Background(), db, workspace, jobID, claimed.ItemID)
			},
			onProgress: func(progress deconstructProgress) {
				_ = database.UpdateDeconstructItemProgress(context.Background(), db, workspace, jobID, claimed.ItemID, progress)
			},
		})
		resultStatus := "error"
		result := map[string]any{"ok": false, "error": stringValue(body["error"])}
		if result["error"] == "" {
			result["error"] = "反推失败（HTTP " + strconv.Itoa(status) + "）"
		}
		if status >= 200 && status < 300 && boolValue(body["success"]) {
			resultStatus = "done"
			result = map[string]any{"ok": true, "partial": body["partial"], "data": body["data"], "stats": body["stats"]}
			if reviewID := stringValue(body["reviewId"]); reviewID != "" {
				result["reviewId"] = reviewID
			}
			if model := stringValue(body["usedModel"]); model != "" {
				result["usedModel"] = model
			}
		}
		if body["code"] == "job_stopped" {
			resultStatus = "stopped"
		}
		_ = database.FinishDeconstructJobItem(context.Background(), db, workspace, jobID, claimed.ItemID, resultStatus, scrubJob(result, apiKey), stringValue(result["error"]))
	}
}

func normalizeJobItems(value any) ([]map[string]any, error) {
	raw, _ := value.([]any)
	items := make([]map[string]any, 0, len(raw))
	for _, entry := range raw {
		item, _ := entry.(map[string]any)
		images := stringList(item["images"])
		for index, image := range images {
			if !strings.HasPrefix(image, "data:") && !strings.HasPrefix(image, "/storage/") && !strings.HasPrefix(image, "http://") && !strings.HasPrefix(image, "https://") {
				return nil, jobImageError("请提供图片链接或本地上传图片")
			}
			if strings.HasPrefix(image, "data:") && !strings.HasPrefix(image, "data:image/") {
				return nil, jobImageError("本地图片格式无效")
			}
			images[index] = image
		}
		item["images"] = images
		items = append(items, item)
	}
	return items, nil
}

func jobRecords(items []map[string]any) []database.DeconstructJobItem {
	records := make([]database.DeconstructJobItem, 0, len(items))
	for _, item := range items {
		records = append(records, database.DeconstructJobItem{ID: stringValue(item["id"]), Input: item})
	}
	return records
}

func jobHint(configBody map[string]any, name string) string {
	hint := stringValue(configBody["userHint"])
	if hint == "" {
		return "套组名称：" + name
	}
	return hint + "（套组名称：" + name + "）"
}

func jobTaskID(jobID, itemID string) string {
	sum := sha256.Sum256([]byte(jobID + ":" + itemID))
	return hex.EncodeToString(sum[:])
}

func scrubJob(value any, apiKey string) any {
	raw, _ := json.Marshal(value)
	text := strings.ReplaceAll(string(raw), apiKey, "[密钥已隐藏]")
	var out any
	_ = json.Unmarshal([]byte(text), &out)
	return out
}

func intValue(value any) int {
	number, _ := value.(float64)
	return int(number)
}

func boolValue(value any) bool {
	flag, _ := value.(bool)
	return flag
}

type jobImageError string

func (e jobImageError) Error() string { return string(e) }

func RecoverDeconstructJobs(cfg config.Config) (int, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	return database.RecoverDeconstructJobs(context.Background(), db)
}

func DrainDeconstructJobs(timeout time.Duration) {
	deconstructJobsMu.Lock()
	deconstructJobsShutdown = true
	pending := make([]chan struct{}, 0, len(deconstructJobsLive))
	for _, live := range deconstructJobsLive {
		live.stopping = true
		pending = append(pending, live.done)
	}
	deconstructJobsMu.Unlock()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for _, done := range pending {
		select {
		case <-done:
		case <-timer.C:
			return
		}
	}
}
