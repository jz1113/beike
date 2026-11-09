package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/taskrecords"
)

type mediaPromptKey struct{}

var mediaJobMu sync.Mutex
var mediaJobWG sync.WaitGroup
var mediaJobActive = map[string]context.CancelFunc{}
var mediaJobSlots = make(chan struct{}, 2)

func DrainMediaJobs(timeout time.Duration) {
	mediaJobMu.Lock()
	for _, cancel := range mediaJobActive {
		if cancel != nil {
			cancel()
		}
	}
	mediaJobMu.Unlock()
	done := make(chan struct{})
	go func() {
		mediaJobWG.Wait()
		close(done)
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
	}
}

type mediaJob struct {
	Trace     json.RawMessage `json:"trace,omitempty"`
	Selection string          `json:"selection,omitempty"`
	ID        string          `json:"id"`
	Kind      string          `json:"kind"`
	Name      string          `json:"name"`
	Status    string          `json:"status"`
	CreatedAt string          `json:"createdAt"`
	StartedAt string          `json:"startedAt"`
	UpdatedAt string          `json:"updatedAt"`
	Error     string          `json:"error,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
}

const mediaJobColumns = "id,kind,name,status,createdAt,startedAt,updatedAt,error,result,COALESCE(json_extract(NULLIF(retryInput,''),'$.selection'),''),COALESCE(json_extract(NULLIF(retryInput,''),'$.trace'),'{}')"

func scanMediaJob(row interface{ Scan(...any) error }) (mediaJob, error) {
	var j mediaJob
	var result, trace string
	err := row.Scan(&j.ID, &j.Kind, &j.Name, &j.Status, &j.CreatedAt, &j.StartedAt, &j.UpdatedAt, &j.Error, &result, &j.Selection, &trace)
	j.Result = json.RawMessage(result)
	j.Trace = json.RawMessage(trace)
	return j, err
}
func mediaNow() string { return time.Now().UTC().Format(time.RFC3339Nano) }
func mediaFail(w http.ResponseWriter, status int, message string) {
	httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
}

// Older clients keep the synchronous contract. Only explicitly submitted stages detach.
func BackgroundMedia(cfg config.Config, kind string, handler http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Prefer") != "respond-async" {
			handler.ServeHTTP(w, r)
			return
		}
		limit := int64(64 << 10)
		if kind == "video" {
			limit = 8 << 20
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
		var input map[string]any
		if err != nil || json.Unmarshal(raw, &input) != nil || input == nil {
			mediaFail(w, 400, "后台任务输入无效或过大")
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		if kind == "video" {
			r.Header.Del("X-Sales-Duration")
			if duration, ok := input["duration"].(float64); ok && duration > 0 && duration <= 600 {
				r.Header.Set("X-Sales-Duration", strconv.FormatFloat(duration, 'f', -1, 64))
			}
			if audio, ok := input["audio"].(bool); ok {
				if audio {
					r.Header.Set("X-Sales-Speech", "1")
				} else {
					r.Header.Del("X-Sales-Speech")
				}
			}
		}
		r.Header.Del("X-Sales-Retry-Depth")
		ctx := context.WithoutCancel(r.Context())
		version := ""
		if kind == "analysis" {
			if _, err := localScriptVideoFile(assetCreationText(input["videoUrl"]), workspace); err != nil {
				mediaFail(w, 400, err.Error())
				return
			}
			prompt, err := loadSalesPrompt(r.Context(), cfg, workspace, "script-analysis")
			if err != nil {
				promptStorageFailure(w, err)
				return
			}
			ctx = context.WithValue(ctx, mediaPromptKey{}, prompt)
			version = prompt.Version
			if input["includeDepth"] == true {
				operation := assetCreationText(input["depthOperationId"])
				if len(operation) > 256 {
					mediaFail(w, 400, "深度任务标识无效")
					return
				}
				r.Header.Set("X-Sales-Depth-Operation", operation)
				ctx = context.WithValue(ctx, importDepthSource{}, assetCreationText(input["videoUrl"]))
			}
		}
		// The fingerprint includes routing and storage settings. Credentials never enter the job table.
		operationKey := ""
		if kind == "video" {
			operationKey = assetCreationText(input["clientTaskId"])
		}
		delete(input, "clientTaskId")
		name, _ := url.QueryUnescape(r.Header.Get("X-Sales-Name"))
		if len([]rune(name)) > 180 {
			name = string([]rune(name)[:180])
		}
		var versions []string
		cacheable := false
		if kind == "video" {
			versions, cacheable = videoInputVersions(input, workspace)
		}
		data, _ := json.Marshal([]any{kind, name, input, version, versions, r.Header.Get("X-Sales-Speech"), r.Header.Get("x-custom-base-url"), r.Header.Get("x-custom-protocol"), r.Header.Get("x-request-template"), r.Header.Get("x-custom-api-key")})
		if operationKey != "" {
			data, _ = json.Marshal([]any{string(data), operationKey})
		}
		digest := sha256.Sum256(data)
		key := hex.EncodeToString(digest[:])
		savedPrompt, _ := ctx.Value(mediaPromptKey{}).(salesPrompt)
		retry := mediaRetrySnapshot(kind, r, raw, savedPrompt, input["includeDepth"] == true, mediaTraceJSON(input, workspace))
		if kind == "mix" {
			var body audioMixRequest
			if json.Unmarshal(raw, &body) == nil {
				b, _ := json.Marshal(body)
				retry = string(b)
			}
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			mediaFail(w, 503, "后台任务存储不可用")
			return
		}
		// Hold the connection for the lifetime of the worker, including its terminal write.
		mediaJobMu.Lock()
		defer mediaJobMu.Unlock()
		release := true
		defer func() {
			if release {
				db.Close()
			}
		}()
		old, err := scanMediaJob(db.QueryRow(`SELECT `+mediaJobColumns+` FROM SalesMediaJob WHERE workspaceId=? AND inputKey=? AND status IN ('queued','running')`, workspace, key))
		if err == nil {
			if mediaJobActive[old.ID] != nil {
				httpx.WriteJSON(w, 202, map[string]any{"success": true, "job": old})
				return
			}
			if err = interruptMediaJob(db, workspace, old.ID); err != nil {
				mediaFail(w, 503, "旧任务状态暂不可用")
				return
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			mediaFail(w, 503, "读取后台任务失败")
			return
		}
		if len(mediaJobActive) >= 32 {
			mediaFail(w, 429, "后台队列已满，请稍后再试")
			return
		}
		j := mediaJob{ID: "sales_media_" + httpx.RequestID(), Kind: kind, Name: name, Status: "queued", CreatedAt: mediaNow()}
		j.UpdatedAt = j.CreatedAt
		j.Result = json.RawMessage("{}")
		if kind == "video" {
			previous, complete, err := previousMediaVideo(db, workspace, key, cacheable)
			if err != nil {
				mediaFail(w, 503, "查询原视频回执失败")
				return
			}
			if complete {
				httpx.WriteJSON(w, 202, map[string]any{"success": true, "job": previous})
				return
			}
			if previous.ID != "" {
				j.Result = previous.Result
			}
		}
		_, err = db.Exec(`INSERT INTO SalesMediaJob(id,workspaceId,kind,name,inputKey,status,createdAt,updatedAt,retryInput,result) VALUES(?,?,?,?,?,?,?,?,?,?)`, j.ID, workspace, kind, name, key, j.Status, j.CreatedAt, j.UpdatedAt, retry, string(j.Result))
		if err != nil {
			mediaFail(w, 503, "任务未能入队，请重试")
			return
		}
		ctx, cancel := context.WithTimeout(ctx, 2*time.Hour)
		mediaJobActive[j.ID] = cancel
		release = false
		req := r.Clone(ctx)
		req.Body = io.NopCloser(bytes.NewReader(raw))
		releaseSource := func() {}
		if kind == "analysis" {
			releaseSource = holdScriptSource(workspace, assetCreationText(input["videoUrl"]))
		}
		mediaJobWG.Add(1)
		go func() { defer mediaJobWG.Done(); defer releaseSource(); runMediaJob(db, j, req, handler, cancel, cfg) }()
		w.Header().Set("Cache-Control", "no-store")
		httpx.WriteJSON(w, 202, map[string]any{"success": true, "job": j})
	}
}
func interruptMediaJob(db *sql.DB, workspace, id string) error {
	_, err := db.Exec(`UPDATE SalesMediaJob SET status='failed',error=?,updatedAt=? WHERE workspaceId=? AND id=? AND status IN ('queued','running')`, "服务中断；已提交的视频请按原任务记录恢复，其他阶段可单独重试", mediaNow(), workspace, id)
	return err
}

func MediaJobs(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			mediaFail(w, 503, "后台任务存储不可用")
			return
		}
		defer db.Close()
		workspace, id := httpx.WorkspaceFrom(r), r.URL.Query().Get("id")
		if id != "" {
			j, err := scanMediaJob(db.QueryRow(`SELECT `+mediaJobColumns+` FROM SalesMediaJob WHERE workspaceId=? AND id=?`, workspace, id))
			if errors.Is(err, sql.ErrNoRows) {
				mediaFail(w, 404, "任务不存在")
				return
			}
			if err != nil {
				mediaFail(w, 503, "读取任务失败")
				return
			}
			if r.Method == http.MethodPost {
				switch r.URL.Query().Get("action") {
				case "cancel":
					mediaJobMu.Lock()
					cancel := mediaJobActive[id]
					if cancel != nil {
						cancel()
					}
					mediaJobMu.Unlock()
					if cancel == nil {
						mediaFail(w, 409, "任务已结束或中断，请刷新")
						return
					}
				case "retry":
					if j.Status != "failed" && j.Status != "canceled" && j.Status != "partial" {
						mediaFail(w, 409, "请在原阶段核对输入后重试")
						return
					}
					if j.Kind != "mix" {
						retryMediaStage(w, r, cfg, j)
						return
					}
					var raw string
					if err := db.QueryRow(`SELECT retryInput FROM SalesMediaJob WHERE id=? AND workspaceId=?`, id, workspace).Scan(&raw); err != nil || raw == "" {
						mediaFail(w, 409, "原合成输入不可用")
						return
					}
					r.Body = io.NopCloser(strings.NewReader(raw))
					r.Header.Set("Prefer", "respond-async")
					r.Header.Set("X-Sales-Name", url.QueryEscape(j.Name))
					BackgroundMedia(cfg, "mix", AudioMix(cfg)).ServeHTTP(w, r)
					return
				default:
					mediaFail(w, 400, "未知任务操作")
					return
				}
			}
			if err := refreshMediaJob(db, workspace, &j); err != nil {
				mediaFail(w, 503, "读取任务失败")
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "job": j})
			return
		}
		if r.Method != http.MethodGet {
			mediaFail(w, 400, "缺少任务编号")
			return
		}
		rows, err := db.QueryContext(r.Context(), `SELECT `+mediaJobColumns+` FROM SalesMediaJob WHERE workspaceId=? ORDER BY createdAt DESC LIMIT 100`, workspace)
		if err != nil {
			mediaFail(w, 503, "读取任务列表失败")
			return
		}
		jobs := []mediaJob{}
		for rows.Next() {
			j, e := scanMediaJob(rows)
			if e != nil {
				rows.Close()
				mediaFail(w, 503, "读取任务失败")
				return
			}
			jobs = append(jobs, j)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			mediaFail(w, 503, "读取任务失败")
			return
		}
		for i := range jobs {
			if err := refreshMediaJob(db, workspace, &jobs[i]); err != nil {
				mediaFail(w, 503, "读取任务失败")
				return
			}
			// Only the detail view needs full scripts. Summaries keep the list bounded.
			var links struct {
				Stage      string `json:"stage,omitempty"`
				VideoURL   string `json:"videoUrl,omitempty"`
				AudioURL   string `json:"audioUrl,omitempty"`
				ResultURL  string `json:"resultUrl,omitempty"`
				ExistingID string `json:"existingId,omitempty"`
				TaskID     string `json:"taskId,omitempty"`
			}
			_ = json.Unmarshal(jobs[i].Result, &links)
			jobs[i].Result, _ = json.Marshal(links)
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "jobs": jobs})
	}
}
func refreshMediaJob(db *sql.DB, workspace string, j *mediaJob) error {
	if j.Status != "running" && j.Status != "queued" {
		return nil
	}
	mediaJobMu.Lock()
	defer mediaJobMu.Unlock()
	if mediaJobActive[j.ID] != nil {
		return nil
	}
	if err := interruptMediaJob(db, workspace, j.ID); err != nil {
		return err
	}
	updated, err := scanMediaJob(db.QueryRow(`SELECT `+mediaJobColumns+` FROM SalesMediaJob WHERE workspaceId=? AND id=?`, workspace, j.ID))
	*j = updated
	return err
}

// Background wrappers retain cumulative usage when later receipts omit details.
func mergeVideoUsageReceipt(receipt, data map[string]any) {
	if assetCreationText(receipt["recordId"]) == "" && assetCreationText(data["recordId"]) != "" {
		receipt["recordId"] = data["recordId"]
	}
	incoming := gateway.NormalizeUsage(data)
	if incoming == nil {
		return
	}
	previous := gateway.NormalizeUsage(receipt)
	if previous != nil {
		for _, key := range []string{"promptTokens", "completionTokens", "totalTokens"} {
			incoming[key] = math.Max(incoming[key].(float64), previous[key].(float64))
		}
	}
	incoming["totalTokens"] = math.Max(incoming["totalTokens"].(float64), incoming["promptTokens"].(float64)+incoming["completionTokens"].(float64))
	receipt["usage"] = incoming
}

const salesTaskSource = `
 SELECT id,name,kind,status,createdAt,startedAt,
 CASE WHEN status IN ('queued','running') THEN '' ELSE updatedAt END,
 COALESCE(json_extract(NULLIF(retryInput,''),'$.selection'),''), COALESCE(json_extract(NULLIF(result,''),'$.taskId'),''),
 '',error,COALESCE(json_extract(NULLIF(result,''),'$.stage'),''),
 COALESCE(json_extract(NULLIF(result,''),'$.videoUrl'),json_extract(NULLIF(result,''),'$.resultUrl'),json_extract(NULLIF(result,''),'$.audioUrl'),'')
 FROM SalesMediaJob WHERE workspaceId=?1
 UNION ALL
 SELECT id,COALESCE(NULLIF(json_extract(assetDataJson,'$.name'),''),NULLIF(json_extract(assetDataJson,'$.title'),''),NULLIF(assetId,''),id),kind,CASE WHEN status IN ('analyzing','creating','generating','saving') THEN 'running' ELSE status END,createdAt,'',
 CASE WHEN status IN ('failed','completed') THEN updatedAt ELSE '' END,model,taskId,'',error,CASE status WHEN 'analyzing' THEN '分析素材' WHEN 'creating' THEN '创建资产' WHEN 'generating' THEN '生成视角图' WHEN 'saving' THEN '保存资产' ELSE '' END,resultUrl
 FROM SalesAssetViewJob WHERE workspaceId=?1`

func TaskRecords(cfg config.Config) http.HandlerFunc {
	return taskrecords.Handler(cfg, salesTaskSource, func(db *sql.DB, workspace string) error {
		rows, err := db.Query("SELECT "+mediaJobColumns+" FROM SalesMediaJob WHERE workspaceId=? AND status IN ('queued','running')", workspace)
		if err != nil {
			return err
		}
		var jobs []mediaJob
		for rows.Next() {
			j, err := scanMediaJob(rows)
			if err != nil {
				rows.Close()
				return err
			}
			jobs = append(jobs, j)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for i := range jobs {
			if err := refreshMediaJob(db, workspace, &jobs[i]); err != nil {
				return err
			}
		}
		return nil
	})
}
