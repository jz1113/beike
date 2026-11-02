package sales

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type storedReferenceScript struct {
	DepthVideoURL    string         `json:"depthVideoUrl"`
	DepthTaskID      string         `json:"depthTaskId"`
	DepthOperationID string         `json:"depthOperationId"`
	ID               string         `json:"id"`
	Title            string         `json:"title"`
	VideoURL         string         `json:"videoUrl"`
	VideoHash        string         `json:"videoHash"`
	DurationSec      float64        `json:"durationSec"`
	Format           string         `json:"format"`
	VoiceMode        string         `json:"voiceMode"`
	Status           string         `json:"status"`
	Script           map[string]any `json:"script"`
	Model            string         `json:"model"`
	PromptVersion    string         `json:"promptVersion"`
	Version          int            `json:"version"`
	UseCount         int            `json:"useCount"`
	LastUsedAt       string         `json:"lastUsedAt"`
	CreatedAt        string         `json:"createdAt"`
	UpdatedAt        string         `json:"updatedAt"`
}

type saveScriptBody struct {
	DepthVideoURL    string         `json:"depthVideoUrl"`
	DepthTaskID      string         `json:"depthTaskId"`
	DepthOperationID string         `json:"depthOperationId"`
	ID               string         `json:"id"`
	Title            string         `json:"title"`
	VideoURL         string         `json:"videoUrl"`
	VideoHash        string         `json:"videoHash"`
	Status           string         `json:"status"`
	Model            string         `json:"model"`
	PromptVersion    string         `json:"promptVersion"`
	Script           map[string]any `json:"script"`
}

type patchScriptBody struct {
	VideoURL         *string        `json:"videoUrl"`
	DepthVideoURL    *string        `json:"depthVideoUrl"`
	DepthTaskID      *string        `json:"depthTaskId"`
	DepthOperationID *string        `json:"depthOperationId"`
	Title            *string        `json:"title"`
	Status           *string        `json:"status"`
	Script           map[string]any `json:"script"`
	RecordUse        bool           `json:"recordUse"`
}

func validScriptFormat(v string) string {
	switch v {
	case "presenter", "hands", "product", "mixed":
		return v
	default:
		return "presenter"
	}
}

func validScriptVoiceMode(v string) string {
	switch v {
	case "speech", "voiceover", "mixed", "none":
		return v
	default:
		return "speech"
	}
}

func validScriptStatus(v string) (string, bool) {
	switch v {
	case "draft", "verified", "archived":
		return v, true
	case "":
		return "draft", true
	default:
		return "", false
	}
}

func scanReferenceScript(scanner interface{ Scan(...any) error }) (storedReferenceScript, error) {
	var item storedReferenceScript
	var raw string
	err := scanner.Scan(&item.ID, &item.Title, &item.VideoURL, &item.VideoHash, &item.DurationSec, &item.Format, &item.VoiceMode, &item.Status, &raw, &item.Model, &item.PromptVersion, &item.Version, &item.UseCount, &item.LastUsedAt, &item.CreatedAt, &item.UpdatedAt, &item.DepthVideoURL, &item.DepthTaskID, &item.DepthOperationID)
	if err != nil {
		return item, err
	}
	_ = json.Unmarshal([]byte(raw), &item.Script)
	if item.Script == nil {
		item.Script = map[string]any{}
	}
	return item, nil
}

const selectReferenceScriptCols = `SELECT "id","title","videoUrl","videoHash","durationSec","format","voiceMode","status","scriptJson","model","promptVersion","version","useCount","lastUsedAt","createdAt","updatedAt","depthVideoUrl","depthTaskId","depthOperationId" FROM "SalesReferenceScript"`

func readReferenceScriptByID(ctx context.Context, db *sql.DB, workspace, id string) (storedReferenceScript, error) {
	return scanReferenceScript(db.QueryRowContext(ctx, selectReferenceScriptCols+` WHERE "workspaceId"=? AND "id"=?`, workspace, id))
}

func Scripts(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "脚本资产库暂不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		switch r.Method {
		case http.MethodGet:
			listOrGetScripts(w, r, db, workspace)
		case http.MethodPost:
			createOrReplaceScript(w, r, db, workspace)
		default:
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
		}
	}
}

func listOrGetScripts(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string) {
	if id := strings.TrimSpace(r.URL.Query().Get("id")); id != "" {
		item, err := readReferenceScriptByID(r.Context(), db, workspace, id)
		if err != nil {
			httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "参考脚本不存在"})
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "item": item})
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" {
		if _, ok := validScriptStatus(status); !ok {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "脚本状态筛选无效"})
			return
		}
	}
	format := strings.TrimSpace(r.URL.Query().Get("format"))
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(query)) > 100 {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "搜索词最多 100 字"})
		return
	}
	sqlText := selectReferenceScriptCols + ` WHERE "workspaceId"=? AND (?='' OR "status"=?) AND ((?='' AND "status"!='archived') OR ?='archived' OR (?<>'' AND "status"=?)) AND (?='' OR "format"=?) AND (?='' OR instr(lower("title" || ' ' || "scriptJson"), lower(?)) > 0) ORDER BY "updatedAt" DESC, "id" DESC LIMIT 200`
	rows, err := db.QueryContext(r.Context(), sqlText, workspace, status, status, status, status, status, status, format, format, query, query)
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取脚本资产库失败"})
		return
	}
	defer rows.Close()
	items := []storedReferenceScript{}
	for rows.Next() {
		item, scanErr := scanReferenceScript(rows)
		if scanErr != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "解析脚本记录失败"})
			return
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "读取脚本资产库失败"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "items": items})
}

func createOrReplaceScript(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace string) {
	var body saveScriptBody
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
	if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "保存脚本请求格式错误"})
		return
	}
	if err := validateScriptLinks(r.Context(), db, workspace, body.VideoURL, body.DepthVideoURL, body.DepthTaskID, body.DepthOperationID); err != nil {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
		return
	}
	check, err := validateScriptObject(body.Script)
	if err != nil {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "参考脚本时间轴无效：" + err.Error()})
		return
	}
	if err := validateScriptTaxonomyRefs(r.Context(), db, workspace, body.Script); err != nil {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
		return
	}
	status, ok := validScriptStatus(strings.TrimSpace(body.Status))
	if !ok {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "脚本状态无效"})
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = strings.TrimSpace(check.Title)
	}
	if title == "" {
		title = "未命名参考脚本"
	}
	if len([]rune(title)) > 120 {
		title = string([]rune(title)[:120])
	}
	body.Script["title"] = title
	raw, _ := json.Marshal(body.Script)
	now := time.Now().UTC().Format(time.RFC3339)
	id := strings.TrimSpace(body.ID)
	if id == "" {
		id = "script_" + httpx.RequestID()
	}
	format := validScriptFormat(check.Format)
	voiceMode := validScriptVoiceMode(check.VoiceMode)
	_, err = db.ExecContext(r.Context(), `INSERT INTO "SalesReferenceScript" ("id","workspaceId","title","videoUrl","videoHash","durationSec","format","voiceMode","status","scriptJson","model","promptVersion","version","useCount","lastUsedAt","createdAt","updatedAt","depthVideoUrl","depthTaskId","depthOperationId") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,'',?,?,?,?,?) ON CONFLICT("id") DO UPDATE SET "title"=excluded."title","videoUrl"=CASE WHEN excluded."videoUrl"<>'' THEN excluded."videoUrl" ELSE "SalesReferenceScript"."videoUrl" END,"depthVideoUrl"=CASE WHEN excluded."depthVideoUrl"<>'' THEN excluded."depthVideoUrl" ELSE "SalesReferenceScript"."depthVideoUrl" END,"depthTaskId"=CASE WHEN excluded."depthTaskId"<>'' THEN excluded."depthTaskId" ELSE "SalesReferenceScript"."depthTaskId" END,"depthOperationId"=CASE WHEN excluded."depthOperationId"<>'' THEN excluded."depthOperationId" ELSE "SalesReferenceScript"."depthOperationId" END,"videoHash"=CASE WHEN excluded."videoHash"<>'' THEN excluded."videoHash" ELSE "SalesReferenceScript"."videoHash" END,"durationSec"=excluded."durationSec","format"=excluded."format","voiceMode"=excluded."voiceMode","status"=excluded."status","scriptJson"=excluded."scriptJson","version"="SalesReferenceScript"."version"+1,"updatedAt"=excluded."updatedAt" WHERE "SalesReferenceScript"."workspaceId"=excluded."workspaceId"`,
		id, workspace, title, strings.TrimSpace(body.VideoURL), strings.TrimSpace(body.VideoHash), check.DurationSec, format, voiceMode, status, string(raw), strings.TrimSpace(body.Model), strings.TrimSpace(body.PromptVersion), now, now, strings.TrimSpace(body.DepthVideoURL), strings.TrimSpace(body.DepthTaskID), strings.TrimSpace(body.DepthOperationID))
	if err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "保存参考脚本失败"})
		return
	}
	item, err := readReferenceScriptByID(r.Context(), db, workspace, id)
	if err != nil {
		httpx.WriteJSON(w, 409, map[string]any{"success": false, "error": "脚本编号冲突或不属于当前工作区"})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "item": item})
}

func ScriptByID(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.PathValue("id"))
		if id == "" {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "缺少脚本编号"})
			return
		}
		db, err := database.OpenRequired(cfg.SQLiteFile())
		if err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "脚本资产库暂不可用"})
			return
		}
		defer db.Close()
		workspace := httpx.WorkspaceFrom(r)
		if r.Method == http.MethodDelete {
			res, delErr := db.ExecContext(r.Context(), `DELETE FROM "SalesReferenceScript" WHERE "workspaceId"=? AND "id"=?`, workspace, id)
			if delErr != nil {
				httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "删除参考脚本失败"})
				return
			}
			affected, _ := res.RowsAffected()
			if affected == 0 {
				httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "参考脚本不存在"})
				return
			}
			httpx.WriteJSON(w, 200, map[string]any{"success": true})
			return
		}
		if r.Method != http.MethodPatch {
			httpx.WriteJSON(w, 405, map[string]any{"success": false, "error": "不支持的请求方式"})
			return
		}
		patchReferenceScript(w, r, db, workspace, id)
	}
}

func patchReferenceScript(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string) {
	current, err := readReferenceScriptByID(r.Context(), db, workspace, id)
	if err != nil {
		httpx.WriteJSON(w, 404, map[string]any{"success": false, "error": "参考脚本不存在"})
		return
	}
	var body patchScriptBody
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
	if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "更新脚本请求格式错误"})
		return
	}
	if err := validateScriptLinks(r.Context(), db, workspace, linkValue(body.VideoURL), linkValue(body.DepthVideoURL), linkValue(body.DepthTaskID), linkValue(body.DepthOperationID)); err != nil {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
		return
	}
	if body.Title == nil && body.Status == nil && body.Script == nil && !body.RecordUse {
		patchScriptLinks(w, r, db, workspace, id, body)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if body.RecordUse && body.Title == nil && body.Status == nil && body.Script == nil && body.VideoURL == nil && body.DepthVideoURL == nil && body.DepthTaskID == nil && body.DepthOperationID == nil {
		// Usage can arrive after another tab saves or reclassifies this script.
		// Never write the previously read content back as part of a statistic.
		if _, err := db.ExecContext(r.Context(), `UPDATE "SalesReferenceScript" SET "useCount"="useCount"+1,"lastUsedAt"=?,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`, now, now, workspace, id); err != nil {
			httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "记录脚本使用失败"})
			return
		}
		writePatchedScript(w, r, db, workspace, id)
		return
	}
	title, status := current.Title, current.Status
	versionIncrement := 0
	durationSec, format, voiceMode := current.DurationSec, current.Format, current.VoiceMode
	scriptMap := current.Script
	if body.Title != nil {
		if trimmed := strings.TrimSpace(*body.Title); trimmed != "" {
			title = trimmed
			scriptMap["title"] = title
		}
	}
	if body.Status != nil {
		nextStatus, ok := validScriptStatus(strings.TrimSpace(*body.Status))
		if !ok {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "脚本状态无效"})
			return
		}
		status = nextStatus
	}
	if body.Script != nil {
		if err := validateScriptTaxonomyRefs(r.Context(), db, workspace, body.Script); err != nil {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": err.Error()})
			return
		}
		check, checkErr := validateScriptObject(body.Script)
		if checkErr != nil {
			httpx.WriteJSON(w, 400, map[string]any{"success": false, "error": "参考脚本时间轴无效：" + checkErr.Error()})
			return
		}
		scriptMap = body.Script
		scriptMap["title"] = title
		durationSec = check.DurationSec
		format = validScriptFormat(check.Format)
		voiceMode = validScriptVoiceMode(check.VoiceMode)
		versionIncrement = 1
	}
	useIncrement := 0
	if body.RecordUse {
		useIncrement = 1
	}
	raw, _ := json.Marshal(scriptMap)
	if _, err := db.ExecContext(r.Context(), `UPDATE "SalesReferenceScript" SET "videoUrl"=COALESCE(?,"videoUrl"),"depthVideoUrl"=COALESCE(?,"depthVideoUrl"),"depthTaskId"=COALESCE(?,"depthTaskId"),"depthOperationId"=COALESCE(?,"depthOperationId"),"title"=?,"durationSec"=?,"format"=?,"voiceMode"=?,"status"=?,"scriptJson"=?,"version"="version"+?,"useCount"="useCount"+?,"lastUsedAt"=CASE WHEN ?=1 THEN ? ELSE "lastUsedAt" END,"updatedAt"=? WHERE "workspaceId"=? AND "id"=?`,
		body.VideoURL, body.DepthVideoURL, body.DepthTaskID, body.DepthOperationID, title, durationSec, format, voiceMode, status, string(raw), versionIncrement, useIncrement, useIncrement, now, now, workspace, id); err != nil {
		httpx.WriteJSON(w, 500, map[string]any{"success": false, "error": "更新参考脚本失败"})
		return
	}
	writePatchedScript(w, r, db, workspace, id)
}

func writePatchedScript(w http.ResponseWriter, r *http.Request, db *sql.DB, workspace, id string) {
	updated, err := readReferenceScriptByID(r.Context(), db, workspace, id)
	if err != nil {
		status, message := 500, "读取更新后的参考脚本失败"
		if err == sql.ErrNoRows {
			status, message = 404, "参考脚本不存在"
		}
		httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"success": true, "item": updated})
}
