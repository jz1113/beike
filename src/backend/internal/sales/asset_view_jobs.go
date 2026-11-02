package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type assetViewJobRequest struct {
	Key        string                       `json:"key"`
	Kind       string                       `json:"kind"`
	AssetID    string                       `json:"assetId"`
	Data       map[string]any               `json:"data"`
	Generation map[string]any               `json:"generation"`
	Checkpoint generate.ImageTaskCheckpoint `json:"checkpoint"`
}

func AssetViewJobs(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			assetViewJobFailure(w, 500, "后台生成任务存储不可用")
			return
		}
		defer db.Close()
		assetViewJobMu.Lock()
		defer assetViewJobMu.Unlock()
		if r.Method == http.MethodGet {
			listAssetViewJobs(cfg, db, w, r)
			return
		}
		if r.Method != http.MethodPost {
			assetViewJobFailure(w, 405, "不支持的请求方式")
			return
		}
		var body assetViewJobRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<20))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || strings.TrimSpace(body.Key) == "" || len(body.Key) > 256 || len(assetGridViews[body.Kind]) != 9 || len(body.AssetID) > 160 || body.Generation == nil {
			assetViewJobFailure(w, 400, "请选择人物或场景资产和生图模型")
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		job, err := prepareAssetViewJob(r.Context(), cfg, db, workspace, body)
		if err != nil {
			var client assetViewJobClientError
			if errors.As(err, &client) {
				assetViewJobFailure(w, client.status, client.message)
			} else {
				assetViewJobFailure(w, 500, "保存资产或后台生成任务失败，请重试")
			}
			return
		}
		identity := assetViewJobIdentity(cfg.SQLiteFile(), workspace, job.ID)
		if job.Status != "completed" && !assetViewJobActive[identity] {
			job.Status, job.Error = "queued", ""
			if err := persistAssetViewJob(r.Context(), db, workspace, &job); err != nil {
				assetViewJobFailure(w, 500, "保存后台生成任务失败")
				return
			}
			payload := safeAssetViewGeneration(job.generation)
			for _, key := range []string{"customApiKey", "apiKey"} {
				if value, ok := body.Generation[key]; ok {
					payload[key] = value
				}
			}
			job.generation = payload
			request := r.Clone(context.WithoutCancel(r.Context()))
			request.Body = nil
			assetViewJobActive[identity] = true
			go runAssetViewJob(cfg, request, job)
		}
		httpx.WriteJSON(w, http.StatusAccepted, map[string]any{"success": true, "job": job})
	}
}

type assetViewJobClientError struct {
	status  int
	message string
}

func (e assetViewJobClientError) Error() string { return e.message }

func prepareAssetViewJob(ctx context.Context, cfg config.Config, db *sql.DB, workspace string, body assetViewJobRequest) (assetViewJob, error) {
	job, err := loadAssetViewJob(ctx, db, workspace, "requestKey", body.Key)
	if err == nil {
		if job.Kind != body.Kind || body.AssetID != "" && job.AssetID != "" && body.AssetID != job.AssetID {
			return job, assetViewJobClientError{409, "任务标识已用于其他资产，请刷新资产库"}
		}
		if !job.baseSaved || job.AssetID == "" {
			err = recoverAssetViewJobAsset(ctx, db, workspace, &job, job.assetData)
			return job, err
		}
		return job, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return job, err
	}
	model, _ := body.Generation["model"].(string)
	if strings.TrimSpace(model) == "" {
		return job, assetViewJobClientError{400, "请选择生图模型"}
	}
	selection, _ := body.Generation["modelSelection"].(string)
	if selection == "" {
		selection = model
	}
	var activeCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "SalesAssetViewJob" WHERE "workspaceId"=? AND "status" NOT IN ('completed','failed')`, workspace).Scan(&activeCount); err != nil {
		return job, err
	}
	if activeCount >= 100 {
		return job, assetViewJobClientError{429, "后台生成队列已满，请等待现有任务完成"}
	}
	prompt, err := loadSalesPrompt(ctx, cfg, workspace, body.Kind+"-grid")
	if err != nil {
		return job, err
	}
	// The server owns the grid instructions even when a caller supplies a prompt.
	body.Generation["prompt"] = prompt.Prompt
	body.Generation["source"] = "sales_" + body.Kind + "_view"
	body.Generation["metadata"] = map[string]any{"workflow": "sales_" + body.Kind + "_view", "layout": "3x3", "promptVersion": prompt.Version}
	id, err := database.NewID()
	if err != nil {
		return job, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	name, _ := body.Data["name"].(string)
	if name == "" {
		name, _ = body.Data["title"].(string)
	}
	job = assetViewJob{ID: "sales_view_" + id, Key: body.Key, Kind: body.Kind, AssetID: body.AssetID, Model: selection, Name: name, Status: "queued", Images: map[string]string{}, CreatedAt: now, UpdatedAt: now, generation: safeAssetViewGeneration(body.Generation), checkpoint: body.Checkpoint, assetData: body.Data}
	if err := validateAssetViewJobData(body.Kind, body.Data); err != nil {
		return job, err
	}
	if err := persistAssetViewJob(ctx, db, workspace, &job); err != nil {
		return job, err
	}
	if err := recoverAssetViewJobAsset(ctx, db, workspace, &job, body.Data); err != nil {
		job.Status, job.Error = "failed", "基础资产保存失败，请重试"
		_ = persistAssetViewJob(context.WithoutCancel(ctx), db, workspace, &job)
		return job, err
	}
	return job, nil
}

func listAssetViewJobs(cfg config.Config, db *sql.DB, w http.ResponseWriter, r *http.Request) {
	workspace, id := httpx.WorkspaceFrom(r), r.URL.Query().Get("jobId")
	if len(id) > 160 {
		assetViewJobFailure(w, 400, "任务标识无效")
		return
	}
	if id != "" {
		job, err := loadAssetViewJob(r.Context(), db, workspace, "id", id)
		if errors.Is(err, sql.ErrNoRows) {
			assetViewJobFailure(w, 404, "后台生成任务不存在")
			return
		}
		if err == nil {
			err = interruptOrphanAssetViewJob(r.Context(), db, cfg.SQLiteFile(), workspace, &job)
		}
		if err != nil {
			assetViewJobFailure(w, 500, "读取后台生成任务失败")
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "job": job})
		return
	}
	rows, err := db.QueryContext(r.Context(), `SELECT `+assetViewJobColumns+` FROM "SalesAssetViewJob" WHERE "workspaceId"=? ORDER BY "status" IN ('completed','failed'),"updatedAt" DESC LIMIT 200`, workspace)
	if err != nil {
		assetViewJobFailure(w, 500, "读取后台生成任务失败")
		return
	}
	jobs := []assetViewJob{}
	for rows.Next() {
		job, scanErr := scanAssetViewJob(rows)
		if scanErr != nil {
			err = scanErr
			break
		}
		jobs = append(jobs, job)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	for i := range jobs {
		if err == nil {
			err = interruptOrphanAssetViewJob(r.Context(), db, cfg.SQLiteFile(), workspace, &jobs[i])
		}
	}
	if err != nil {
		assetViewJobFailure(w, 500, "读取后台生成任务失败")
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "jobs": jobs})
}

func assetViewJobFailure(w http.ResponseWriter, status int, message string) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
}
