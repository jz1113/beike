package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

type mediaRetry struct {
	Trace     json.RawMessage        `json:"trace,omitempty"`
	Duration  string                 `json:"duration,omitempty"`
	Selection string                 `json:"selection"`
	Route     string                 `json:"route"`
	Analysis  *scriptAnalysisRequest `json:"analysis,omitempty"`
	Prompt    string                 `json:"prompt,omitempty"`
	Version   string                 `json:"version,omitempty"`
	Operation string                 `json:"operation,omitempty"`
	Depth     bool                   `json:"depth,omitempty"`
	Speech    bool                   `json:"speech,omitempty"`
}

func mediaRouteDigest(base, protocol, template string) string {
	raw, _ := json.Marshal([]string{base, protocol, template})
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
func mediaRetrySnapshot(kind string, r *http.Request, raw []byte, prompt salesPrompt, depth bool, trace json.RawMessage) string {
	selection, _ := url.QueryUnescape(r.Header.Get("X-Sales-Model"))
	if len(selection) > 256 {
		return ""
	}
	s := mediaRetry{Trace: trace, Duration: r.Header.Get("X-Sales-Duration"), Selection: selection, Depth: depth, Operation: r.Header.Get("X-Sales-Depth-Operation"), Speech: r.Header.Get("X-Sales-Speech") == "1"}
	base := r.Header.Get("x-custom-base-url")
	if kind == "analysis" {
		var a scriptAnalysisRequest
		if json.Unmarshal(raw, &a) != nil {
			return ""
		}
		if a.CustomBaseURL != "" {
			base = a.CustomBaseURL
		}
		a.CustomBaseURL, a.CustomAPIKey = "", ""
		a.Force = false
		s.Analysis = &a
		s.Prompt, s.Version = prompt.Prompt, prompt.Version
	}
	s.Route = mediaRouteDigest(base, r.Header.Get("x-custom-protocol"), r.Header.Get("x-request-template"))
	b, _ := json.Marshal(s)
	return string(b)
}
func retryMediaStage(w http.ResponseWriter, r *http.Request, cfg config.Config, j mediaJob) {
	workspace := httpx.WorkspaceFrom(r)
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		mediaFail(w, 503, "读取任务失败")
		return
	}
	ownsDB := true
	defer func() {
		if ownsDB {
			db.Close()
		}
	}()
	var raw string
	if err := db.QueryRow(`SELECT retryInput FROM SalesMediaJob WHERE workspaceId=? AND id=?`, workspace, j.ID).Scan(&raw); err != nil {
		mediaFail(w, 503, "读取原阶段输入失败")
		return
	}
	var s mediaRetry
	if json.Unmarshal([]byte(raw), &s) != nil || s.Route != mediaRouteDigest(r.Header.Get("x-custom-base-url"), r.Header.Get("x-custom-protocol"), r.Header.Get("x-request-template")) {
		mediaFail(w, 409, "渠道配置已变更，请恢复原渠道或在制作页重新核对")
		return
	}
	var handler http.Handler
	ctx := context.WithoutCancel(r.Context())
	switch j.Kind {
	case "analysis":
		if s.Analysis == nil || s.Prompt == "" {
			mediaFail(w, 409, "原分析快照不可用")
			return
		}
		if managedScriptSource(workspace, s.Analysis.VideoURL) != "" {
			if _, err := localScriptVideoFile(s.Analysis.VideoURL, workspace); err != nil {
				mediaFail(w, 409, "参考原片已清理，请在动作素材中重新选择本地文件")
				return
			}
		}
		var result map[string]any
		_ = json.Unmarshal(j.Result, &result)
		ctx = context.WithValue(ctx, mediaPromptKey{}, salesPrompt{ID: "script-analysis", Prompt: s.Prompt, Version: s.Version, Configured: true})
		if s.Depth {
			r.Header.Set("X-Sales-Depth-Operation", s.Operation)
			r.Header.Set("X-Sales-Retry-Depth", "1")
			ctx = context.WithValue(ctx, importDepthSource{}, s.Analysis.VideoURL)
		}
		if s.Depth && assetCreationText(result["existingId"]) != "" {
			// The original script may already be edited. Retry only its outstanding depth work.
			delete(result, "depthWarning")
			handler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { httpx.WriteJSON(w, 200, result) })
		} else {
			handler = ScriptAnalysis(cfg)
		}
		b, _ := json.Marshal(s.Analysis)
		r.Body = io.NopCloser(bytes.NewReader(b))
	case "video":
		var result map[string]any
		_ = json.Unmarshal(j.Result, &result)
		if result["rejected"] == true || (assetCreationText(result["taskKey"]) == "" && assetCreationText(result["taskId"]) == "") {
			mediaFail(w, 409, "没有可继续的渠道任务，请在制作页重新提交")
			return
		}
		r.Header.Set("X-Sales-Duration", s.Duration)
		if s.Speech {
			r.Header.Set("X-Sales-Speech", "1")
		}
		handler = generate.Video(cfg)
	default:
		mediaFail(w, 400, "未知任务阶段")
		return
	}
	mediaJobMu.Lock()
	defer mediaJobMu.Unlock()
	if len(mediaJobActive) >= 32 || mediaJobActive[j.ID] != nil {
		mediaFail(w, 409, "任务已在执行或后台队列已满")
		return
	}
	result, err := db.Exec(`UPDATE SalesMediaJob SET status='queued',error='',updatedAt=? WHERE id=? AND workspaceId=? AND status IN ('failed','partial','canceled')`, mediaNow(), j.ID, workspace)
	if err != nil {
		mediaFail(w, 503, "阶段未能入队")
		return
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		mediaFail(w, 409, "任务状态已更新，请刷新")
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Hour)
	mediaJobActive[j.ID] = cancel
	ownsDB = false
	j.Status, j.Error = "queued", ""
	req := r.Clone(ctx)
	req.Header.Del("Prefer")
	releaseSource := func() {}
	if j.Kind == "analysis" && s.Analysis != nil {
		releaseSource = holdScriptSource(workspace, s.Analysis.VideoURL)
	}
	go func() { defer releaseSource(); runMediaJob(db, j, req, handler, cancel, cfg) }()
	httpx.WriteJSON(w, 202, map[string]any{"success": true, "job": j})
}
