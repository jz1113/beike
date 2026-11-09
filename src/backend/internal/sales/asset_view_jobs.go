package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"maps"
	"net/http"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	dblibrary "beike.local/cloud/src/backend/internal/platform/database/library"
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
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || strings.TrimSpace(body.Key) == "" || len(body.Key) > 256 || (body.Kind != "persona" && body.Kind != "scene") || len(body.AssetID) > 160 || body.Generation == nil {
			assetViewJobFailure(w, 400, "请选择人物或场景资产和生图模型")
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		job, err := prepareAssetViewJob(r.Context(), cfg, db, workspace, body)
		if err != nil {
			var client assetViewJobClientError
			var unconfigured *promptUnconfiguredError
			if errors.As(err, &unconfigured) {
				promptStorageFailure(w, err)
			} else if errors.As(err, &client) {
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
			if creation, ok := payload["assetCreation"].(map[string]any); ok {
				if submitted, ok := body.Generation["assetCreation"].(map[string]any); ok {
					if key, ok := submitted["customApiKey"].(string); ok {
						creation["customApiKey"] = key
					}
				}
			}
			job.generation = payload
			request := r.Clone(context.WithoutCancel(r.Context()))
			request.Body = nil
			assetViewJobActive[identity] = true
			mediaJobWG.Add(1)
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
		if len(job.Images) != len(job.outputViews()) && job.checkpoint.TaskID == "" && job.checkpoint.ResultURL == "" {
			if assetCreationText(job.generation["prompt"]) == "" {
				if _, err := loadSalesPrompt(ctx, cfg, workspace, job.Kind+"-grid"); err != nil {
					return job, err
				}
			}
			if creation := assetCreationSettings(job.generation); creation != nil && assetCreationText(creation["prompt"]) == "" && assetCreationText(creation["designPrompt"]) == "" {
				if _, err := loadSalesPrompt(ctx, cfg, workspace, job.Kind+"-design"); err != nil {
					return job, err
				}
			}
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
	// A paid image task may be resumed directly. A new persona render needs
	// either a saved description or a vision step to derive one first.
	if body.Kind == "persona" && body.Checkpoint.TaskID == "" && body.Checkpoint.ResultURL == "" && assetCreationSettings(body.Generation) == nil {
		creation := assetCreationFromData(body.Data)
		if creation == nil || strings.TrimSpace(creation.Prompt) == "" {
			return job, assetViewJobClientError{400, "请先根据人物参考图反推绘图提示词，再生成三视图"}
		}
	}
	if err := prepareAssetCreation(ctx, cfg, workspace, body.Kind, body.Generation, body.Data); err != nil {
		return job, err
	}
	prompt, err := loadSalesPrompt(ctx, cfg, workspace, body.Kind+"-grid")
	if err != nil {
		return job, err
	}
	// Execute the current workspace's saved text exactly; caller text is task data.
	body.Generation["prompt"] = prompt.Prompt
	body.Generation["source"] = "sales_" + body.Kind + "_view"
	layout := "3x3"
	if body.Kind == "persona" && (body.Checkpoint.TaskID == "" && body.Checkpoint.ResultURL == "" || body.Generation["layout"] == "1x4") {
		if strings.Contains(prompt.Prompt, "多视角九宫格图片") || strings.Contains(prompt.Prompt, "3 行 × 3 列") {
			return job, assetViewJobClientError{400, "当前人物补图仍使用九宫格，请在提示词管理中载入并保存最新的人物补图模板"}
		}
		layout = "1x4"
	}
	metadata := map[string]any{"workflow": "sales_" + body.Kind + "_view", "layout": layout, "promptVersion": prompt.Version}
	if layout == "1x4" {
		metadata["output"] = "sheet"
	}
	body.Generation["metadata"] = metadata
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

func assetViewJobAssetTable(kind string) (string, string, string) {
	if kind == "persona" {
		return "PersonaAsset", "avatarUrl", "personaViews"
	}
	return "SceneAsset", "coverUrl", "sceneViews"
}

func validateAssetViewJobData(kind string, data map[string]any) error {
	nameKey, coverKey := "title", "coverUrl"
	if kind == "persona" {
		nameKey, coverKey = "name", "avatarUrl"
	}
	name, _ := data[nameKey].(string)
	cover, _ := data[coverKey].(string)
	creation := assetCreationFromData(data)
	if strings.TrimSpace(name) == "" || len([]rune(name)) > 80 || strings.TrimSpace(cover) == "" && (creation == nil || strings.TrimSpace(creation.ReferenceImageURL) == "") {
		return assetViewJobClientError{400, "请填写资产名称并上传参考主图"}
	}
	for key, value := range data {
		switch key {
		case "name", "title", "description", "tags", "avatarUrl", "coverUrl", "sourceImages", "dimensions", "spatialType", "lighting", "category", "suitableCategories":
			if _, ok := value.(string); !ok {
				return assetViewJobClientError{400, "资产字段类型无效"}
			}
		default:
			return assetViewJobClientError{400, "不支持的资产字段：" + key}
		}
	}
	if raw, ok := data["dimensions"].(string); ok && raw != "" {
		var dimensions map[string]any
		if json.Unmarshal([]byte(raw), &dimensions) != nil || dimensions == nil {
			return assetViewJobClientError{400, "资产视角数据无效"}
		}
	}
	return nil
}

func recoverAssetViewJobAsset(ctx context.Context, db *sql.DB, workspace string, job *assetViewJob, data map[string]any) error {
	table, _, _ := assetViewJobAssetTable(job.Kind)
	if job.AssetID == "" {
		// If a process stopped between the asset commit and recording its ID, the
		// marker recovers that exact asset instead of creating a second one.
		err := db.QueryRowContext(ctx, `SELECT "id" FROM "`+table+`" WHERE "workspaceId"=? AND json_valid("dimensions") AND json_extract("dimensions",'$.salesAssetViewJobId')=? LIMIT 1`, workspace, job.ID).Scan(&job.AssetID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil {
			job.baseSaved = true
			return persistAssetViewJob(ctx, db, workspace, job)
		}
	}
	if err := validateAssetViewJobData(job.Kind, data); err != nil {
		return err
	}
	var raw json.RawMessage
	var err error
	if job.AssetID == "" {
		clean := map[string]any{}
		for key, value := range data {
			clean[key] = value
		}
		dimensions := map[string]any{}
		if text, _ := data["dimensions"].(string); text != "" {
			_ = json.Unmarshal([]byte(text), &dimensions)
		}
		dimensions["salesAssetViewJobId"] = job.ID
		encoded, _ := json.Marshal(dimensions)
		clean["dimensions"] = string(encoded)
		raw, err = dblibrary.CreateLibraryAsset(ctx, db, workspace, job.Kind, clean)
	} else {
		raw, err = dblibrary.UpdateLibraryAsset(ctx, db, workspace, job.Kind, job.AssetID, data)
	}
	if errors.Is(err, dblibrary.ErrLibraryRecordMissing) {
		return assetViewJobClientError{404, "资产不存在或已删除"}
	}
	if err != nil {
		return err
	}
	var saved struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(raw, &saved) != nil || saved.ID == "" {
		return errors.New("saved asset ID missing")
	}
	job.AssetID = saved.ID
	job.baseSaved = true
	return persistAssetViewJob(ctx, db, workspace, job)
}

func saveAssetViewJobImages(ctx context.Context, db *sql.DB, workspace string, job assetViewJob) error {
	table, coverColumn, viewField := assetViewJobAssetTable(job.Kind)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var rawDimensions, rawSources, cover string
	err = tx.QueryRowContext(ctx, `SELECT COALESCE("dimensions",''),COALESCE("sourceImages",'[]'),COALESCE("`+coverColumn+`",'') FROM "`+table+`" WHERE "id"=? AND "workspaceId"=?`, job.AssetID, workspace).Scan(&rawDimensions, &rawSources, &cover)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("资产已删除，生成结果未重新创建资产")
	}
	if err != nil {
		return err
	}
	dimensions := map[string]any{}
	if rawDimensions != "" && (json.Unmarshal([]byte(rawDimensions), &dimensions) != nil || dimensions == nil) {
		return errors.New("现有资产视角数据无效，生成结果已保留")
	}
	views, _ := dimensions[viewField].(map[string]any)
	if views == nil {
		views = map[string]any{}
	}
	if len(views) == 0 {
		views["main"] = cover
	}
	creation := assetCreationResultFor(job.generation)
	if creation != nil {
		current := assetCreationFromData(map[string]any{"dimensions": rawDimensions})
		applied := current != nil && current.ImageURL == creation.ImageURL && current.Prompt == creation.Prompt && assetCreationText(views["main"]) == creation.ImageURL
		if current == nil || current.ReferenceImageURL != creation.ReferenceImageURL || !applied && assetCreationText(views["main"]) != assetViewJobMain(job.Kind, job.assetData) {
			return errors.New("资产参考图或主图已更改，生成结果已保留，请重新生成")
		}
		if creation.ImageURL == "" || creation.Prompt == "" {
			return errors.New("资产主图或绘图提示词尚未生成")
		}
		if !applied && !(job.gridKind() == personaStrip && creation.ImageURL == views["main"]) {
			views = map[string]any{"main": creation.ImageURL}
		}
		cover = creation.ImageURL
		dimensions["assetCreation"] = creation
	}
	if expected := assetViewJobMain(job.Kind, job.assetData); expected != "" {
		current, _ := views["main"].(string)
		if creation == nil && current != expected {
			return errors.New("参考主图已更改，原视角图已保留，请使用当前主图重新生成")
		}
	}
	for _, view := range job.outputViews() {
		existing, _ := views[view].(string)
		if strings.TrimSpace(existing) == "" {
			if job.Images[view] == "" {
				return errors.New("视角图裁片不完整")
			}
			views[view] = job.Images[view]
		}
	}
	dimensions[viewField] = views
	if job.Kind == "persona" && creation == nil {
		if face, _ := views["face"].(string); face != "" {
			cover = face
		}
	}
	sources, seen := []string{}, map[string]bool{}
	add := func(value string) {
		if value != "" && !seen[value] {
			seen[value] = true
			sources = append(sources, value)
		}
	}
	main, _ := views["main"].(string)
	add(main)
	for _, view := range job.outputViews() {
		text, _ := views[view].(string)
		add(text)
	}
	if creation == nil || job.gridKind() == personaStrip && creation.ImageURL == assetViewJobMain(job.Kind, job.assetData) {
		for _, value := range parseSourceImageList(rawSources, cover) {
			add(value)
		}
	}
	encodedDimensions, err := json.Marshal(dimensions)
	if err != nil {
		return err
	}
	encodedSources, err := json.Marshal(sources)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE "`+table+`" SET "dimensions"=?,"sourceImages"=?,"`+coverColumn+`"=?,"updatedAt"=? WHERE "id"=? AND "workspaceId"=?`, string(encodedDimensions), string(encodedSources), cover, time.Now().UTC().Format(time.RFC3339Nano), job.AssetID, workspace)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return errors.New("资产已删除")
	}
	return tx.Commit()
}

func assetViewJobMain(kind string, data map[string]any) string {
	_, coverField, viewField := assetViewJobAssetTable(kind)
	var dimensions map[string]any
	raw, _ := data["dimensions"].(string)
	if json.Unmarshal([]byte(raw), &dimensions) == nil {
		if views, ok := dimensions[viewField].(map[string]any); ok {
			if main, ok := views["main"].(string); ok && (main != "" || dimensions["assetCreation"] != nil) {
				return main
			}
		}
	}
	cover, _ := data[coverField].(string)
	return cover
}

func runAssetViewJob(cfg config.Config, request *http.Request, job assetViewJob) {
	defer mediaJobWG.Done()
	workspace := httpx.WorkspaceFrom(request)
	defer func() {
		assetViewJobMu.Lock()
		delete(assetViewJobActive, assetViewJobIdentity(cfg.SQLiteFile(), workspace, job.ID))
		assetViewJobMu.Unlock()
	}()
	// Waiting behind other uploads must not consume the per-model execution
	// budget. The queue is capped separately and credentials remain in memory.
	ctx, cancel := context.WithTimeout(request.Context(), 24*time.Hour)
	defer cancel()
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		log.Printf("[sales-views] open task database: %v", err)
		return
	}
	defer db.Close()
	fail := func(err error) {
		job.Status, job.Error = "failed", err.Error()
		writeCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer stop()
		if saveErr := persistAssetViewJob(writeCtx, db, workspace, &job); saveErr != nil {
			log.Printf("[sales-views] persist task failure: %v", saveErr)
		}
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			fail(fmt.Errorf("后台生成中断：%v", recovered))
		}
	}()
	select {
	case assetViewJobSlots <- struct{}{}:
		defer func() { <-assetViewJobSlots }()
	case <-ctx.Done():
		fail(ctx.Err())
		return
	}
	executionCtx, cancelExecution := context.WithTimeout(ctx, 20*time.Minute)
	defer cancelExecution()
	ctx = executionCtx
	// Deleting the base asset while queued must not trigger a paid generation.
	table, _, _ := assetViewJobAssetTable(job.Kind)
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM "`+table+`" WHERE "id"=? AND "workspaceId"=?`, job.AssetID, workspace).Scan(&exists); err != nil {
		fail(err)
		return
	}
	if exists != 1 {
		fail(fmt.Errorf("资产已删除，后台生成已停止"))
		return
	}
	advance := func(status string) error {
		job.Status, job.Error = status, ""
		return persistAssetViewJob(ctx, db, workspace, &job)
	}
	if err := runAssetCreation(ctx, cfg, db, request, &job, advance); err != nil {
		fail(err)
		return
	}
	if len(job.Images) != len(job.outputViews()) {
		if job.checkpoint.TaskID == "" && job.checkpoint.ResultURL == "" && assetCreationText(job.generation["prompt"]) == "" {
			prompt, err := loadSalesPrompt(ctx, cfg, workspace, job.Kind+"-grid")
			if err != nil {
				fail(err)
				return
			}
			job.generation["prompt"] = prompt.Prompt
			job.generation["metadata"] = map[string]any{"workflow": "sales_" + job.Kind + "_view", "layout": "3x3", "promptVersion": prompt.Version}
		}
		if err := advance("generating"); err != nil {
			fail(err)
			return
		}
		payload := maps.Clone(job.generation)
		// Receipt state changes during recovery and is not a generation input.
		delete(payload, "viewCheckpoint")
		delete(payload, "usageScopes")
		if job.gridKind() == personaStrip {
			var description string
			if creation := assetCreationSettings(job.generation); creation != nil {
				description = assetCreationText(creation["prompt"])
				ref := assetCreationText(creation["referenceImageUrl"])
				payload["useReferenceImage"], payload["referenceImageUrl"], payload["referenceImages"] = true, ref, []any{ref}
			} else if creation := assetCreationFromData(job.assetData); creation != nil {
				description = creation.Prompt
			}
			if description != "" {
				payload["prompt"] = assetCreationText(payload["prompt"]) + "\n\n人物参考描述：\n" + description
			}
		}
		checkpoint, err := generate.RunImageTask(cfg, request.Clone(ctx), payload, job.Key, job.checkpoint, func(checkpoint generate.ImageTaskCheckpoint) error {
			job.checkpoint = checkpoint
			return persistAssetViewJob(ctx, db, workspace, &job)
		})
		job.checkpoint = checkpoint
		if err != nil {
			fail(err)
			return
		}
		stage := "cropping"
		whole := job.wholeSheet()
		if whole {
			stage = "saving"
		}
		if err := advance(stage); err != nil {
			fail(err)
			return
		}
		select {
		case assetGridSlots <- struct{}{}:
		case <-ctx.Done():
			fail(ctx.Err())
			return
		}
		images, err := storeAssetViewJobResult(ctx, job.checkpoint.ResultURL, job.gridKind(), workspace, whole)
		<-assetGridSlots
		if err != nil {
			fail(fmt.Errorf("视角图已生成，保存失败，可继续补全：%w", err))
			return
		}
		job.Images = map[string]string{}
		for _, image := range images {
			job.Images[image.View] = image.URL
		}
	}
	if state := assetCreationSettings(job.generation); job.gridKind() == personaStrip && state != nil {
		main := assetViewJobMain(job.Kind, job.assetData)
		if main == "" {
			main = job.Images["sheet"]
			if main == "" {
				main = job.Images["face"]
			}
		}
		state["imageUrl"] = main
	}
	if err := advance("saving"); err != nil {
		fail(err)
		return
	}
	if err := saveAssetViewJobImages(ctx, db, workspace, job); err != nil {
		fail(fmt.Errorf("生成结果已保留，资产保存失败：%w", err))
		return
	}
	if err := advance("completed"); err != nil {
		fail(err)
	}
}

func storeAssetViewJobResult(ctx context.Context, source, kind, workspace string, whole bool) ([]assetGridImage, error) {
	data, err := readAssetGrid(ctx, source, workspace)
	if err != nil {
		return nil, err
	}
	return storeAssetViewResult(ctx, data, kind, workspace, whole)
}

type assetViewJob struct {
	UsageScopes   map[string]assetUsageScope `json:"usageScopes,omitempty"`
	UsageReceipts []assetUsageReceipt        `json:"usageReceipts,omitempty"`
	ID            string                     `json:"id"`
	Key           string                     `json:"key"`
	Kind          string                     `json:"kind"`
	AssetID       string                     `json:"assetId"`
	Model         string                     `json:"model"`
	Name          string                     `json:"name"`
	Status        string                     `json:"status"`
	Error         string                     `json:"error"`
	Images        map[string]string          `json:"images"`
	CreatedAt     string                     `json:"createdAt"`
	UpdatedAt     string                     `json:"updatedAt"`
	Creation      *assetCreationResult       `json:"creation,omitempty"`
	checkpoint    generate.ImageTaskCheckpoint
	generation    map[string]any
	assetData     map[string]any
	baseSaved     bool
}

var assetViewJobMu sync.Mutex
var assetViewJobActive = map[string]bool{}
var assetViewJobSlots = make(chan struct{}, 2)

const assetViewJobColumns = `"id","requestKey","kind","assetId","model","status","error","imagesJson","createdAt","updatedAt","taskId","resultUrl","generationJson","assetDataJson","baseSaved"`

func scanAssetViewJob(row interface{ Scan(...any) error }) (assetViewJob, error) {
	var job assetViewJob
	var images, generation, assetData string
	err := row.Scan(&job.ID, &job.Key, &job.Kind, &job.AssetID, &job.Model, &job.Status, &job.Error, &images, &job.CreatedAt, &job.UpdatedAt, &job.checkpoint.TaskID, &job.checkpoint.ResultURL, &generation, &assetData, &job.baseSaved)
	if err != nil {
		return job, err
	}
	job.Images = map[string]string{}
	job.generation = map[string]any{}
	job.assetData = map[string]any{}
	if json.Unmarshal([]byte(images), &job.Images) != nil || json.Unmarshal([]byte(generation), &job.generation) != nil || json.Unmarshal([]byte(assetData), &job.assetData) != nil {
		return job, errors.New("invalid saved asset generation")
	}
	if saved, ok := job.generation["viewCheckpoint"].(map[string]any); ok {
		taskID, resultURL := job.checkpoint.TaskID, job.checkpoint.ResultURL
		encoded, _ := json.Marshal(saved)
		_ = json.Unmarshal(encoded, &job.checkpoint)
		job.checkpoint.TaskID, job.checkpoint.ResultURL = taskID, resultURL
	}
	job.refreshUsageReceipts()
	job.Creation = assetCreationResultFor(job.generation)
	job.Name, _ = job.assetData["name"].(string)
	if job.Name == "" {
		job.Name, _ = job.assetData["title"].(string)
	}
	return job, nil
}

func loadAssetViewJob(ctx context.Context, db *sql.DB, workspace, column, value string) (assetViewJob, error) {
	if column != "id" && column != "requestKey" {
		return assetViewJob{}, errors.New("invalid job lookup")
	}
	return scanAssetViewJob(db.QueryRowContext(ctx, `SELECT `+assetViewJobColumns+` FROM "SalesAssetViewJob" WHERE "workspaceId"=? AND "`+column+`"=?`, workspace, value))
}

func persistAssetViewJob(ctx context.Context, db *sql.DB, workspace string, job *assetViewJob) error {
	job.Creation = assetCreationResultFor(job.generation)
	job.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	images, err := json.Marshal(job.Images)
	if err != nil {
		return err
	}
	job.generation["viewCheckpoint"] = assetCheckpointMap(job.checkpoint)
	job.refreshUsageReceipts()
	generation, err := json.Marshal(safeAssetViewGeneration(job.generation))
	if err != nil {
		return err
	}
	assetData, err := json.Marshal(job.assetData)
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, `INSERT INTO "SalesAssetViewJob" ("id","workspaceId","requestKey","kind","assetId","model","status","error","imagesJson","createdAt","updatedAt","taskId","resultUrl","generationJson","assetDataJson","baseSaved") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT("id") DO UPDATE SET "assetId"=excluded."assetId","status"=excluded."status","error"=excluded."error","imagesJson"=excluded."imagesJson","updatedAt"=excluded."updatedAt","taskId"=excluded."taskId","resultUrl"=excluded."resultUrl","generationJson"=excluded."generationJson","baseSaved"=excluded."baseSaved"`, job.ID, workspace, job.Key, job.Kind, job.AssetID, job.Model, job.Status, job.Error, string(images), job.CreatedAt, job.UpdatedAt, job.checkpoint.TaskID, job.checkpoint.ResultURL, string(generation), string(assetData), job.baseSaved)
	return err
}

func safeAssetViewGeneration(payload map[string]any) map[string]any {
	// Only generation settings needed for recovery are persisted. Credentials stay
	// in the detached request and must be provided again after a service restart.
	out := map[string]any{}
	for _, key := range []string{"model", "modelSelection", "prompt", "size", "quality", "imageQuality", "aspectRatio", "customBaseUrl", "customProtocol", "requestTemplate", "imageProtocol", "imageProtocolTemplate", "useReferenceImage", "referenceImageUrl", "referenceImages", "source", "metadata", "allowInsecureHttp", "assetCreation", "viewCheckpoint", "usageScopes"} {
		if value, ok := payload[key]; ok {
			out[key] = withoutAssetViewSecrets(value)
		}
	}
	return out
}

func withoutAssetViewSecrets(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		clean := map[string]any{}
		for key, nested := range typed {
			if key == "usage" {
				if usage := gateway.NormalizeUsage(map[string]any{"usage": nested}); usage != nil {
					clean[key] = usage
				}
				continue
			}
			lower := strings.ToLower(key)
			if strings.Contains(lower, "key") || strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "authorization") {
				text, _ := nested.(string)
				if !strings.Contains(text, "{{apiKey}}") {
					continue
				}
			}
			clean[key] = withoutAssetViewSecrets(nested)
		}
		return clean
	case []any:
		clean := make([]any, len(typed))
		for i, nested := range typed {
			clean[i] = withoutAssetViewSecrets(nested)
		}
		return clean
	default:
		return value
	}
}

func assetViewJobRunning(job assetViewJob) bool {
	return job.Status != "completed" && job.Status != "failed"
}

func assetViewJobIdentity(file, workspace, id string) string {
	return file + "\x00" + workspace + "\x00" + id
}

func interruptOrphanAssetViewJob(ctx context.Context, db *sql.DB, file, workspace string, job *assetViewJob) error {
	if !assetViewJobRunning(*job) || assetViewJobActive[assetViewJobIdentity(file, workspace, job.ID)] {
		return nil
	}
	job.Status, job.Error = "failed", "服务已重启或任务中断，请继续补全；将核对原任务并沿用已生成图片"
	return persistAssetViewJob(ctx, db, workspace, job)
}
