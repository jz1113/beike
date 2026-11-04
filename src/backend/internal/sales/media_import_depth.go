package sales

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate/depth"
	"beike.local/cloud/src/backend/internal/httpx"
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

// The script is already committed. Bind only the accepted depth operation for this
// script/source pair, preserving concurrent edits to the storyboard and its taxonomy.
func completeImportDepth(cfg config.Config, db *sql.DB, r *http.Request, scriptID, source string, handler http.Handler) error {
	workspace := httpx.WorkspaceFrom(r)
	script, err := readReferenceScriptByID(r.Context(), db, workspace, scriptID)
	if err != nil {
		return errors.New("脚本已被移除")
	}
	if script.VideoURL != savedSource(workspace, source) {
		return errors.New("脚本已关联其他原片，请在动作素材核对")
	}
	if script.DepthVideoURL != "" {
		return nil
	}
	file, err := localScriptVideoFile(source, workspace)
	if err != nil {
		return err
	}
	if script.VideoURL == "" && fileHash(file) != script.VideoHash {
		return errors.New("参考视频与脚本不匹配")
	}
	info, err := os.Stat(file)
	if err != nil {
		return errors.New("参考视频已失效")
	}
	if script.DurationSec > 30 || info.Size() > 35<<20 {
		return errors.New("视频超过深度转换的 30 秒或 35 MB 限制")
	}
	operation := script.DepthOperationID
	if operation == "" {
		operation = r.Header.Get("X-Sales-Depth-Operation")
		if operation == "" {
			operation = "sales_import_" + scriptID
		}
	}
	task := script.DepthTaskID
	retryFailed := false
	if task != "" && r.Header.Get("X-Sales-Retry-Depth") == "1" {
		req := r.Clone(r.Context())
		req.Method = "GET"
		req.Body = nil
		req.URL.RawQuery = url.Values{"taskId": {task}}.Encode()
		state, status := invokeMedia(handler, req)
		if status == 200 && state["status"] == "FAILURE" {
			retryFailed = true
			operation = "sales_retry_" + httpx.RequestID()
			task = ""
		}
	}
	if task == "" {
		request := r.Clone(r.Context())
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("x-idempotency-key", operation)
		raw, _ := json.Marshal(map[string]any{"videoUrl": source, "style": "mocap", "quality": "standard", "clientTaskId": operation})
		request.Body = io.NopCloser(bytes.NewReader(raw))
		request.Method = "POST"
		var receipt map[string]any
		var status int
		if script.DepthOperationID != "" && !retryFailed {
			request.Method = "GET"
			request.URL.RawQuery = url.Values{"taskKey": {operation}}.Encode()
		}
		receipt, status = invokeMedia(handler, request)
		if status >= 300 || receipt["success"] != true {
			return mediaResponseError(receipt)
		}
		task = assetCreationText(receipt["taskId"])
		if task == "" {
			return errors.New("深度转换缺少任务编号")
		}
		updated, err := db.ExecContext(r.Context(), `UPDATE SalesReferenceScript SET depthOperationId=?,depthTaskId=?,updatedAt=? WHERE workspaceId=? AND id=? AND videoUrl=? AND videoHash=? AND depthVideoUrl='' AND (depthOperationId='' OR depthOperationId=? OR depthOperationId=?) AND (depthTaskId='' OR depthTaskId=? OR depthTaskId=?)`, operation, task, mediaNow(), workspace, scriptID, script.VideoURL, script.VideoHash, script.DepthOperationID, operation, task, script.DepthTaskID)
		if err != nil {
			return errors.New("保存深度任务关联失败")
		}
		n, _ := updated.RowsAffected()
		if n != 1 {
			return errors.New("脚本关联已变更，可在原任务查看深度结果")
		}
	}
	poll := r.Clone(r.Context())
	poll.Method = "GET"
	poll.Body = nil
	poll.URL.RawQuery = url.Values{"taskId": {task}}.Encode()
	for {
		data, status := invokeMedia(handler, poll)
		if status >= 300 || data["status"] == "FAILURE" {
			return mediaResponseError(data)
		}
		if result := assetCreationText(data["resultUrl"]); data["status"] == "SUCCESS" && result != "" {
			if err := validateScriptLinks(r.Context(), db, workspace, source, result, task, operation); err != nil {
				return err
			}
			updated, err := db.ExecContext(r.Context(), `UPDATE SalesReferenceScript SET depthVideoUrl=?,updatedAt=? WHERE id=? AND workspaceId=? AND videoUrl=? AND videoHash=? AND depthTaskId=? AND depthVideoUrl=''`, result, mediaNow(), scriptID, workspace, script.VideoURL, script.VideoHash, task)
			if err != nil {
				return errors.New("保存深度视频结果失败")
			}
			n, _ := updated.RowsAffected()
			if n != 1 {
				current, err := readReferenceScriptByID(r.Context(), db, workspace, scriptID)
				if err == nil && current.DepthVideoURL == result && current.DepthTaskID == task {
					return nil
				}
				return errors.New("脚本深度关联已更新，保留当前结果")
			}
			return nil
		}
		select {
		case <-time.After(2 * time.Second):
		case <-r.Context().Done():
			return r.Context().Err()
		}
	}
}

type importDepthSource struct{}

func runImportDepth(cfg config.Config, db *sql.DB, r *http.Request, scriptID, source string) error {
	return completeImportDepth(cfg, db, r, scriptID, source, depth.DepthVideo(cfg))
}
