package sales

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type mediaResponse struct {
	bytes.Buffer
	header http.Header
	status int
}

func (m *mediaResponse) Header() http.Header  { return m.header }
func (m *mediaResponse) WriteHeader(code int) { m.status = code }
func invokeMedia(handler http.Handler, r *http.Request) (map[string]any, int) {
	w := &mediaResponse{header: make(http.Header), status: 200}
	handler.ServeHTTP(w, r)
	var data map[string]any
	_ = json.Unmarshal(w.Bytes(), &data)
	return data, w.status
}
func runMediaJob(db *sql.DB, j mediaJob, r *http.Request, handler http.Handler, cancel context.CancelFunc, cfg config.Config) {
	ctx := r.Context()
	workspace := httpx.WorkspaceFrom(r)
	var result map[string]any
	var failure error
	defer func() {
		if recover() != nil {
			failure = errors.New("后台阶段异常中断")
		}
		status, message := "completed", ""
		if failure != nil {
			status, message = "failed", failure.Error()
		}
		if result != nil && assetCreationText(result["depthWarning"]) != "" {
			status, message = "partial", assetCreationText(result["depthWarning"])
		}
		if ctx.Err() != nil && (result == nil || status == "partial") {
			status, message = "canceled", "已停止后台处理；已提交给渠道的视频请到生成历史核对"
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				status, message = "failed", "后台处理超时，请核对已有结果"
			}
		}
		raw, _ := json.Marshal(result)
		_, err := db.Exec(`UPDATE SalesMediaJob SET status=?,error=?,result=CASE WHEN ?='null' THEN result ELSE ? END,updatedAt=? WHERE id=? AND workspaceId=?`, status, message, string(raw), string(raw), mediaNow(), j.ID, workspace)
		if err != nil {
			log.Printf("[sales-media] job=%s terminal write failed", j.ID)
		}
		log.Printf("[sales-media] job=%s stage=%s status=%s", j.ID, j.Kind, status)
		cancel()
		mediaJobMu.Lock()
		delete(mediaJobActive, j.ID)
		mediaJobMu.Unlock()
		db.Close()
	}()
	select {
	case mediaJobSlots <- struct{}{}:
		defer func() { <-mediaJobSlots }()
	case <-ctx.Done():
		return
	}
	if ctx.Err() != nil {
		return
	}
	now := mediaNow()
	stage := map[string]string{"video": "提交或恢复原渠道任务", "analysis": "分析参考视频", "mix": "读取音轨并合成 MP4"}[j.Kind]
	_, failure = db.Exec(`UPDATE SalesMediaJob SET status='running',startedAt=?,updatedAt=?,result=json_set(result,'$.stage',?) WHERE id=?`, now, now, stage, j.ID)
	if failure != nil {
		return
	}
	var previous map[string]any
	_ = json.Unmarshal(j.Result, &previous)
	var data map[string]any
	status := 200
	switch {
	case j.Kind == "video" && assetCreationText(previous["taskId"]) != "":
		data = previous
		data["success"] = true
	case j.Kind == "video" && assetCreationText(previous["taskKey"]) != "":
		data, status = invokeMedia(handler, resumeVideoRequest(ctx, r, previous))
	default:
		if j.Kind == "video" {
			key := r.Header.Get("x-idempotency-key")
			raw, _ := json.Marshal(map[string]any{"taskKey": key, "stage": "提交渠道任务"})
			if _, failure = db.Exec(`UPDATE SalesMediaJob SET result=? WHERE id=?`, string(raw), j.ID); failure != nil {
				return
			}
		}
		data, status = invokeMedia(handler, r)
	}
	if status >= 300 || data["success"] != true {
		if j.Kind == "video" && (data["submissionRejected"] == true || status == 400 && data["submissionUnknown"] != true) {
			result = map[string]any{"rejected": true}
		}
		failure = mediaResponseError(data)
		return
	}
	if j.Kind != "video" {
		if source, ok := ctx.Value(importDepthSource{}).(string); ok && assetCreationText(data["existingId"]) != "" {
			data["stage"] = "转换并关联深度视频"
			raw, _ := json.Marshal(data)
			delete(data, "stage")
			if _, failure = db.Exec(`UPDATE SalesMediaJob SET result=?,updatedAt=? WHERE id=?`, string(raw), mediaNow(), j.ID); failure != nil {
				return
			}
			if err := runImportDepth(cfg, db, r, assetCreationText(data["existingId"]), source); err != nil {
				data["depthWarning"] = err.Error()
			}
		}
		result = data
		return
	}
	taskID := assetCreationText(data["taskId"])
	model := assetCreationText(data["model"])
	receipt := map[string]any{"stage": "等待渠道返回原片", "taskId": taskID, "taskKey": data["taskKey"], "model": model}
	raw, _ := json.Marshal(receipt)
	_, failure = db.Exec(`UPDATE SalesMediaJob SET result=?,updatedAt=? WHERE id=?`, string(raw), mediaNow(), j.ID)
	if failure != nil {
		return
	}
	if assetCreationText(data["resultUrl"]) == "" {
		if taskID == "" {
			failure = errors.New("渠道未返回原任务编号，请核对生成历史")
			return
		}
		poll := r.Clone(ctx)
		poll.Method = http.MethodGet
		poll.Body = nil
		poll.URL.RawQuery = url.Values{"taskId": {taskID}, "model": {model}}.Encode()
		delay := 3 * time.Second
		for {
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return
			}
			data, status = invokeMedia(handler, poll)
			if status == 408 || status == 429 || status >= 500 || data["retryable"] == true {
				delay = 15 * time.Second
				continue
			}
			if status >= 300 || data["status"] == "FAILURE" {
				if data["status"] == "FAILURE" {
					result = map[string]any{"taskId": taskID, "rejected": true}
				}
				failure = mediaResponseError(data)
				return
			}
			if data["status"] == "SUCCESS" && assetCreationText(data["resultUrl"]) != "" {
				break
			}
			if progress := assetCreationText(data["progress"]); progress != "" && receipt["progress"] != progress {
				receipt["progress"] = progress
				receipt["stage"] = "渠道生成中 " + progress
				raw, _ = json.Marshal(receipt)
				if _, failure = db.Exec(`UPDATE SalesMediaJob SET result=?,updatedAt=? WHERE id=?`, string(raw), mediaNow(), j.ID); failure != nil {
					return
				}
			}
			delay = 5 * time.Second
		}
	}
	mediaURL := assetCreationText(data["resultUrl"])
	receipt["resultUrl"] = mediaURL
	receipt["stage"] = "解码、验收并保存原片"
	raw, _ = json.Marshal(receipt)
	if _, failure = db.Exec(`UPDATE SalesMediaJob SET result=?,updatedAt=? WHERE id=?`, string(raw), mediaNow(), j.ID); failure != nil {
		return
	}
	expected, _ := strconv.ParseFloat(r.Header.Get("X-Sales-Duration"), 64)
	stored, err := storeSalesVideoResult(ctx, cfg, workspace, mediaURL, r.Header.Get("X-Sales-Speech") == "1", expected)
	if err != nil {
		failure = fmt.Errorf("原片已返回，验收失败：%w", err)
		result = receipt
		return
	}
	delete(receipt, "stage")
	receipt["resultUrl"], receipt["status"], receipt["success"] = stored, "SUCCESS", true
	result = receipt
}
func mediaResponseError(data map[string]any) error {
	for _, key := range []string{"error", "failReason"} {
		if message := assetCreationText(data[key]); message != "" {
			return errors.New(message)
		}
	}
	return errors.New("后台阶段执行失败，请核对素材和模型配置")
}
