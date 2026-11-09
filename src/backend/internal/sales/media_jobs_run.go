package sales

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
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
		if ctx.Err() != nil && (result == nil || status == "partial" || j.Kind == "video" && result["status"] != "SUCCESS") {
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
	stage := map[string]string{"video": "提交或恢复原渠道任务", "analysis": "分析参考视频", "mix": "读取音轨并合成 MP4", "voice": "合成人声并保存音频"}[j.Kind]
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
		if j.Kind == "video" || j.Kind == "voice" {
			key := r.Header.Get("x-idempotency-key")
			raw, _ := json.Marshal(map[string]any{"taskKey": key, "stage": "提交渠道任务", "submissionUnknown": j.Kind == "voice"})
			if _, failure = db.Exec(`UPDATE SalesMediaJob SET result=? WHERE id=?`, string(raw), j.ID); failure != nil {
				return
			}
		}
		data, status = invokeMedia(handler, r)
	}
	if j.Kind == "voice" {
		result = data
		if result == nil {
			result = map[string]any{"success": false, "submissionUnknown": true}
		}
		result["taskKey"] = r.Header.Get("x-idempotency-key")
	}
	if status >= 300 || data["success"] != true {
		if j.Kind == "video" && data != nil {
			result = data
			if assetCreationText(result["taskKey"]) == "" {
				result["taskKey"] = r.Header.Get("x-idempotency-key")
			}
		}
		if j.Kind == "video" && (data["submissionRejected"] == true || status == 400 && data["submissionUnknown"] != true) {
			if result == nil {
				result = map[string]any{}
			}
			result["rejected"] = true
		}
		failure = mediaResponseError(data)
		return
	}
	if j.Kind != "video" {
		if j.Kind == "voice" {
			result = data
			stored, err := storeSalesVoiceResult(ctx, cfg, workspace, assetCreationText(data["audioUrl"]))
			if err != nil {
				failure = err
				return
			}
			data["audioUrl"], data["resultUrl"] = stored, stored
			_, failure = db.Exec(`UPDATE ImageTask SET resultUrl=? WHERE workspaceId=? AND taskId=? AND mediaType='audio'`, stored, workspace, assetCreationText(data["taskId"]))
			if failure != nil {
				return
			}
		}
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
	receipt := map[string]any{"stage": "等待渠道返回原片", "taskId": taskID, "taskKey": data["taskKey"], "recordId": data["recordId"], "model": model}
	mergeVideoUsageReceipt(receipt, data)
	result = receipt
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
		recordID := assetCreationText(data["recordId"])
		if recordID == "" && assetCreationText(data["taskKey"]) != "" {
			_ = db.QueryRowContext(ctx, `SELECT "id" FROM "ImageTask" WHERE "workspaceId"=? AND "mediaType"='video' AND "idempotencyKey"=? LIMIT 1`, workspace, assetCreationText(data["taskKey"])).Scan(&recordID)
		}
		if recordID != "" {
			poll.Header.Set("x-task-record-id", recordID)
			receipt["recordId"] = recordID
		}
		poll.URL.RawQuery = url.Values{"taskId": {taskID}, "model": {model}}.Encode()
		delay := 3 * time.Second
		for {
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return
			}
			data, status = invokeMedia(handler, poll)
			mergeVideoUsageReceipt(receipt, data)
			if data["usage"] != nil {
				raw, _ = json.Marshal(receipt)
				if _, failure = db.Exec(`UPDATE SalesMediaJob SET result=?,updatedAt=? WHERE id=?`, string(raw), mediaNow(), j.ID); failure != nil {
					return
				}
			}
			if status == 408 || status == 429 || status >= 500 || data["retryable"] == true {
				delay = 15 * time.Second
				continue
			}
			if status >= 300 || data["status"] == "FAILURE" {
				if data["status"] == "FAILURE" {
					receipt["rejected"] = true
					result = receipt
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

// Save only attribution fields and role-ordered identifiers. Signed URLs, inline
// media, routing headers and provider request templates are excluded.
type mediaTrace struct {
	ScriptID        string   `json:"scriptId,omitempty"`
	ScriptVersion   int      `json:"scriptVersion,omitempty"`
	TemplateVersion string   `json:"templateVersion,omitempty"`
	AdaptVersion    string   `json:"adaptVersion,omitempty"`
	PromptDigest    string   `json:"promptDigest,omitempty"`
	References      []string `json:"references,omitempty"`
}

func mediaTraceFrom(input map[string]any, workspace string) mediaTrace {
	var trace mediaTrace
	if raw, ok := input["salesTrace"].(map[string]any); ok {
		// Values originate with the editor; only accept bounded version identifiers.
		for key, out := range map[string]*string{"scriptId": &trace.ScriptID, "templateVersion": &trace.TemplateVersion, "adaptVersion": &trace.AdaptVersion} {
			if v := assetCreationText(raw[key]); len(v) <= 180 && !strings.ContainsAny(v, "/?#@\r\n") {
				*out = v
			}
		}
		if v, ok := raw["scriptVersion"].(float64); ok && v > 0 && v <= 1e9 {
			trace.ScriptVersion = int(v)
		}
	}
	if prompt := assetCreationText(input["prompt"]); prompt != "" {
		digest := sha256.Sum256([]byte(prompt))
		trace.PromptDigest = hex.EncodeToString(digest[:])
	}
	for _, field := range []string{"images", "videos", "audios"} {
		refs, _ := input[field].([]any)
		for _, ref := range refs {
			value := assetCreationText(ref)
			digest := sha256.Sum256([]byte(value))
			id := "sha256:" + hex.EncodeToString(digest[:])
			if len(value) <= 2048 && strings.HasPrefix(value, "/storage/"+workspace+"/") && !strings.ContainsAny(value, "?#") && storage.StoredFile(strings.TrimPrefix(value, "/storage/")) != "" {
				id = value
			}
			trace.References = append(trace.References, field+" "+id)
		}
	}
	return trace
}
func mediaTraceJSON(input map[string]any, workspace string) json.RawMessage {
	data, _ := json.Marshal(mediaTraceFrom(input, workspace))
	return data
}

// Mutable remote references cannot establish that two finished videos had identical input bytes.
func videoInputVersions(input map[string]any, workspace string) ([]string, bool) {
	hashes := []string{}
	for _, field := range []string{"images", "videos", "audios"} {
		refs, _ := input[field].([]any)
		for _, ref := range refs {
			source := assetCreationText(ref)
			if strings.HasPrefix(source, "data:") {
				continue
			}
			if !strings.HasPrefix(source, "/storage/") {
				return hashes, false
			}
			rel := strings.SplitN(strings.TrimPrefix(source, "/storage/"), "?", 2)[0]
			if !storage.WorkspaceRel(rel, workspace, true) {
				return hashes, false
			}
			h := fileHash(storage.StoredFile(rel))
			if h == "" {
				return hashes, false
			}
			hashes = append(hashes, h)
		}
	}
	return hashes, true
}

// Reuse a playable owned delivery or the original paid operation. A failed poll, service
// restart, or failed download never authorizes a second POST to the model provider.
func previousMediaVideo(db *sql.DB, workspace, key string, cacheable bool) (mediaJob, bool, error) {
	j, err := scanMediaJob(db.QueryRow(`SELECT `+mediaJobColumns+` FROM SalesMediaJob WHERE workspaceId=? AND inputKey=? AND kind='video' ORDER BY createdAt DESC LIMIT 1`, workspace, key))
	if errors.Is(err, sql.ErrNoRows) {
		return mediaJob{}, false, nil
	}
	if err != nil {
		return mediaJob{}, false, err
	}
	var receipt map[string]any
	_ = json.Unmarshal(j.Result, &receipt)
	if j.Status == "completed" {
		url := assetCreationText(receipt["resultUrl"])
		if cacheable && strings.HasPrefix(url, "/storage/"+workspace+"/") && storage.StoredFile(strings.TrimPrefix(url, "/storage/")) != "" {
			return j, true, nil
		}
		return mediaJob{}, false, nil
	}
	if receipt["rejected"] == true {
		return mediaJob{}, false, nil
	}
	if assetCreationText(receipt["taskKey"]) != "" || assetCreationText(receipt["taskId"]) != "" {
		return j, false, nil
	}
	return mediaJob{}, false, nil
}
func resumeVideoRequest(ctx context.Context, r *http.Request, receipt map[string]any) *http.Request {
	poll := r.Clone(ctx)
	poll.Method = http.MethodGet
	poll.Body = nil
	poll.URL.RawQuery = url.Values{"taskKey": {assetCreationText(receipt["taskKey"])}}.Encode()
	return poll
}
