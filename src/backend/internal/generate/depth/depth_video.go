package depth

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/system"
)

func DepthVideo(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			depthVideoPoll(cfg, w, r)
			return
		}
		if !system.FFmpegReady(cfg.Root) {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false, "submissionRejected": true,
				"error": "深度动作捕捉服务未就绪：请重启 API 服务（npm run dev:api）或执行 npm run setup:depth-env",
			})
			return
		}
		if !system.DepthModelReady(cfg.Root) {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{
				"success": false, "submissionRejected": true,
				"error": "深度模型未就绪，请在终端执行：" + depthSetupCommand,
			})
			return
		}
		depthVideoSubmit(cfg, w, r)
	})
}

type depthReceipt struct {
	Fingerprint string `json:"fingerprint"`
	Kind        string `json:"kind"`
	Status      int    `json:"status,omitempty"`
	Body        string `json:"body,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
}

var depthInflight sync.Map

func guardDepth(cfg config.Config, r *http.Request, kind, operation, fingerprint string, submit func() (int, map[string]any)) (int, map[string]any) {
	operation = strings.TrimSpace(operation)
	if operation == "" {
		return submit()
	}
	if len(operation) > 256 {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识不合法", "submissionRejected": true}
	}
	key := depthReceiptKey(httpx.WorkspaceFrom(r), kind, operation)
	if existing, ok := depthInflight.Load(key); ok {
		flight := existing.(*depthFlight)
		select {
		case <-flight.done:
		case <-r.Context().Done():
			return 408, map[string]any{"success": false, "error": "查询原任务已取消"}
		}
		result := flight.result
		if result.fingerprint != fingerprint {
			return http.StatusConflict, map[string]any{"success": false, "error": "同一任务标识不能用于不同的生成内容"}
		}
		return result.status, result.body
	}
	file, err := depthReceiptFile(cfg, httpx.WorkspaceFrom(r), key)
	if err != nil {
		return http.StatusServiceUnavailable, map[string]any{"success": false, "submissionUnknown": true, "error": "深度任务提交记录暂时无法核对，请查询原任务"}
	}
	if saved, err := readDepthReceipt(file); err == nil {
		if saved.Fingerprint != fingerprint {
			return http.StatusConflict, map[string]any{"success": false, "error": "同一任务标识不能用于不同的生成内容"}
		}
		if saved.Status != 0 && saved.Body != "" {
			return decodeDepthBody(saved.Status, saved.Body)
		}
		return http.StatusConflict, map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}
	}
	claim := depthReceipt{Fingerprint: fingerprint, Kind: kind, CreatedAt: time.Now().UnixMilli()}
	if err := writeDepthReceiptExclusive(file, claim); err != nil {
		if errors.Is(err, os.ErrExist) {
			return http.StatusConflict, map[string]any{"success": false, "error": "该任务正在提交或提交结果待核对，请查询原任务，不要重复提交", "submissionUnknown": true}
		}
		return http.StatusServiceUnavailable, map[string]any{"success": false, "submissionUnknown": true, "error": "深度任务提交记录暂时无法核对，请查询原任务"}
	}
	flight := &depthFlight{done: make(chan struct{}), result: depthResult{fingerprint: fingerprint, status: 503, body: map[string]any{"success": false, "submissionUnknown": true, "error": "原深度任务中断，请查询原任务"}}}
	depthInflight.Store(key, flight)
	defer close(flight.done)
	defer depthInflight.Delete(key)
	status, body := submit()
	raw, _ := json.Marshal(body)
	claim.Status = status
	claim.Body = string(raw)
	_ = writeDepthReceipt(file, claim)
	flight.result = depthResult{status: status, body: body, fingerprint: fingerprint}
	return status, body
}

type depthFlight struct {
	done   chan struct{}
	result depthResult
}

type depthResult struct {
	status      int
	body        map[string]any
	fingerprint string
}

func readDepthSubmission(cfg config.Config, r *http.Request, kind string) (int, map[string]any) {
	key := strings.TrimSpace(r.URL.Query().Get("taskKey"))
	if key == "" || len(key) > 256 {
		return http.StatusBadRequest, map[string]any{"success": false, "error": "任务标识无效"}
	}
	file, err := depthReceiptFile(cfg, httpx.WorkspaceFrom(r), depthReceiptKey(httpx.WorkspaceFrom(r), kind, key))
	if err != nil {
		return http.StatusServiceUnavailable, map[string]any{"success": false, "submissionUnknown": true, "retryable": true, "error": "原深度任务提交记录暂时无法查询"}
	}
	saved, err := readDepthReceipt(file)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return http.StatusOK, map[string]any{"status": "QUERY_FAILED", "operationNotFound": true, "retryable": true, "error": "尚未找到原深度任务回执"}
		}
		return http.StatusServiceUnavailable, map[string]any{"status": "QUERY_FAILED", "submissionUnknown": true, "retryable": true, "error": "原深度任务回执暂时无法读取；不会重新提交"}
	}
	if saved.Kind != "" && saved.Kind != kind || saved.Status == 0 || saved.Body == "" {
		_, running := depthInflight.Load(depthReceiptKey(httpx.WorkspaceFrom(r), kind, key))
		return http.StatusOK, map[string]any{"status": "QUERY_FAILED", "submissionUnknown": true, "submissionPending": running && saved.Kind == kind && saved.Status == 0, "retryable": true, "error": "原深度任务提交结果待核对；不会自动重新提交"}
	}
	return decodeDepthBody(saved.Status, saved.Body)
}

func depthReceiptKey(workspace, kind, operation string) string {
	sum := sha256.Sum256([]byte(workspace + "\x00" + kind + "\x00local-depth\x00" + operation))
	return hex.EncodeToString(sum[:])
}

func depthReceiptFile(cfg config.Config, workspace, key string) (string, error) {
	root := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR"))
	if root == "" {
		if file := cfg.SQLiteFile(); file != "" {
			root = filepath.Dir(file)
		} else {
			root = filepath.Join(cfg.Root, ".local")
		}
	}
	dir := filepath.Join(root, "submission-receipts", workspace)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(dir, key+".json"), nil
}

func readDepthReceipt(file string) (depthReceipt, error) {
	body, err := os.ReadFile(file)
	if err != nil {
		return depthReceipt{}, err
	}
	var saved depthReceipt
	if err := json.Unmarshal(body, &saved); err != nil {
		return depthReceipt{}, err
	}
	return saved, nil
}

func writeDepthReceiptExclusive(file string, receipt depthReceipt) error {
	body, err := json.Marshal(receipt)
	if err != nil {
		return err
	}
	handle, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer handle.Close()
	_, err = handle.Write(body)
	return err
}

func writeDepthReceipt(file string, receipt depthReceipt) error {
	body, err := json.Marshal(receipt)
	if err != nil {
		return err
	}
	temp := file + ".tmp"
	if err := os.WriteFile(temp, body, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, file)
}

func decodeDepthBody(status int, raw string) (int, map[string]any) {
	var body map[string]any
	if json.Unmarshal([]byte(raw), &body) != nil {
		return status, map[string]any{"success": false, "error": raw}
	}
	return status, body
}

func depthFingerprint(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

func depthInputDigest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func persistDepthBytes(cfg config.Config, workspace, contentType string, data []byte, filename string) (string, error) {
	ext := "png"
	folder := "generated/images"
	if strings.Contains(contentType, "mp4") || strings.Contains(contentType, "video") {
		ext = "mp4"
		folder = "generated/videos"
	}
	if filename == "" {
		filename = "depth_" + time.Now().UTC().Format("20060102150405") + "." + ext
	}
	relative := workspace + "/azhuo/" + folder + "/" + time.Now().UTC().Format("200601") + "/" + filename
	root := depthStorageRoot(cfg)
	target := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(target, data, 0o644); err != nil {
		return "", err
	}
	return "/storage/" + relative, nil
}

func depthStorageRoot(cfg config.Config) string {
	if cache := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR")); cache != "" {
		return cache
	}
	if data := strings.TrimSpace(os.Getenv("AZHUO_DATA_DIR")); data != "" {
		return filepath.Join(data, "storage")
	}
	if file := cfg.SQLiteFile(); file != "" {
		return filepath.Join(filepath.Dir(file), "storage")
	}
	return filepath.Join(os.TempDir(), "beike-workbench", "storage")
}

func depthTaskID() string {
	var buf [4]byte
	_, _ = rand.Read(buf[:])
	return "depth_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + hex.EncodeToString(buf[:])
}

const depthVideoFileBytes = 35 * 1024 * 1024

var depthVideoName = regexp.MustCompile(`(?i)\.(mp4|webm|mov|m4v)$`)

func depthVideoForm(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	if headerInt(r.Header.Get("Content-Length")) > depthVideoMaxBytes {
		writeDepthVideoTooLarge(w)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, depthVideoMaxBytes+1))
	if err != nil || int64(len(body)) > depthVideoMaxBytes {
		writeDepthVideoTooLarge(w)
		return
	}
	file, ok := readDepthVideoFile(r.Header.Get("Content-Type"), body)
	if !ok {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"success": false,
			"error":   "视频上传解析失败，请检查视频文件完整性或控制视频大小",
		})
		return
	}
	if file == nil || !file.isFile {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少视频文件 video"})
		return
	}
	if !strings.HasPrefix(file.mediaType, "video/") && !depthVideoName.MatchString(file.name) {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "请上传 MP4 / WebM / MOV 视频文件"})
		return
	}
	if file.size > depthVideoFileBytes {
		writeDepthVideoTooLarge(w)
		return
	}
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation = strings.TrimSpace(file.fields["clientTaskId"])
	}
	acceptDepthVideo(cfg, w, r, file.data, "", "", file.fields["style"], file.fields["quality"], file.fields["resolution"], operation)
}

type depthVideoFile struct {
	name      string
	mediaType string
	size      int
	isFile    bool
	data      []byte
	fields    map[string]string
}

func readDepthVideoFile(contentType string, body []byte) (*depthVideoFile, bool) {
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil || params["boundary"] == "" {
		return nil, false
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	fields := map[string]string{}
	var found *depthVideoFile
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			if found != nil {
				found.fields = fields
			}
			return found, true
		}
		if err != nil {
			return nil, false
		}
		data, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return nil, false
		}
		if part.FileName() == "" {
			if _, seen := fields[part.FormName()]; !seen {
				fields[part.FormName()] = string(data)
			}
			continue
		}
		if found != nil || part.FormName() != "video" {
			continue
		}
		mediaType, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
		found = &depthVideoFile{
			name: part.FileName(), mediaType: mediaType, size: len(data), isFile: true, data: data, fields: fields,
		}
	}
}

func writeDepthVideoTooLarge(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
		"success": false,
		"error":   "视频过大，请控制在 35MB 以内",
	})
}

func depthVideoPoll(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if query.Get("taskId") == "" && query.Has("taskKey") {
		status, body := readDepthSubmission(cfg, r, "depth-video")
		httpx.WriteJSON(w, status, body)
		return
	}
	taskID := query.Get("taskId")
	if taskID == "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "缺少 taskId 参数"})
		return
	}
	record, found, err := depthVideoRecord(cfg, r, taskID)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "查询深度动作捕捉任务失败"})
		return
	}
	if !found {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"success": false, "error": "任务不存在"})
		return
	}
	runtime, hasRuntime := depthVideoState.Load(record.id)
	status := record.status
	if status == "" {
		status = "IN_PROGRESS"
	}
	failReason := record.failReason
	if !hasRuntime && status == "IN_PROGRESS" && time.Since(record.createdAt) > 45*time.Second {
		status = "FAILURE"
		failReason = "任务执行已超时或已中断"
		markDepthVideo(depthVideoJob{cfg: cfg, recordID: record.id}, "FAILURE", "", failReason)
	}
	progress := "10%"
	body := map[string]any{
		"success": true, "taskId": taskID, "status": status, "resultUrl": record.resultURL,
		"failReason": emptyAsNil(failReason), "quality": record.quality,
	}
	if hasRuntime {
		state := runtime.(depthRuntime)
		progress = state.Progress
		body["stage"] = state.Stage
		if state.Meta.ModelID != "" {
			body["modelId"] = state.Meta.ModelID
			body["inferenceSizePx"] = state.Meta.InferenceSizePx
			body["device"] = state.Meta.Device
		}
		if state.Meta.Quality != "" {
			body["quality"] = state.Meta.Quality
		}
	} else if status == "SUCCESS" {
		progress = "100%"
	} else if status == "FAILURE" {
		progress = "0%"
	}
	body["progress"] = progress
	httpx.WriteJSON(w, http.StatusOK, body)
}

type depthVideoRow struct {
	id         string
	status     string
	resultURL  any
	failReason string
	quality    any
	createdAt  time.Time
}

func depthVideoRecord(cfg config.Config, r *http.Request, taskID string) (depthVideoRow, bool, error) {
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		return depthVideoRow{}, false, err
	}
	defer db.Close()
	var row depthVideoRow
	var resultURL, failReason, quality, createdAt sql.NullString
	err = db.QueryRowContext(r.Context(), `
		SELECT "id", "status", "resultUrl", "failReason", "quality", "createdAt" FROM "ImageTask"
		WHERE "workspaceId" = ? AND ("id" = ? OR "taskId" = ?)
		LIMIT 1`, httpx.WorkspaceFrom(r), taskID, taskID).Scan(&row.id, &row.status, &resultURL, &failReason, &quality, &createdAt)
	if err == sql.ErrNoRows {
		return depthVideoRow{}, false, nil
	}
	if err != nil {
		return depthVideoRow{}, false, err
	}
	if resultURL.Valid {
		row.resultURL = resultURL.String
	}
	row.failReason = failReason.String
	if quality.Valid {
		row.quality = quality.String
	}
	row.createdAt = parseDepthTime(createdAt.String)
	return row, true, nil
}

func parseDepthTime(raw string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000Z", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed
		}
	}
	return time.Now()
}

func emptyAsNil(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func depthVideoJSONProbe(cfg config.Config, body []byte) (int, string) {
	var payload struct {
		VideoDataURL string `json:"videoDataUrl"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return 0, ""
	}
	raw := strings.TrimSpace(payload.VideoDataURL)
	comma := strings.Index(raw, ",")
	if !strings.HasPrefix(raw, "data:") || comma < 0 {
		return 0, ""
	}
	data, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil {
		return 0, ""
	}
	return depthVideoPreAccept(cfg, data)
}

func depthVideoPreAccept(cfg config.Config, data []byte) (int, string) {
	if len(data) == 0 {
		return 0, ""
	}
	file, err := os.CreateTemp("", "depth-probe-*")
	if err != nil {
		return 0, ""
	}
	name := file.Name()
	defer os.Remove(name)
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return 0, ""
	}
	if err := file.Close(); err != nil {
		return 0, ""
	}
	probe, err := system.ProbeVideo(cfg.Root, name)
	if err != nil {
		return 0, ""
	}
	return depthVideoProbeHTTP(probe)
}

func depthVideoProbeHTTP(probe system.VideoProbe) (int, string) {
	if probe.Duration > 30 || probe.Width > 1280 || probe.Height > 1280 {
		return 0, ""
	}
	return 0, ""
}

const depthVideoMaxBytes = 35*1024*1024 + 2*1024*1024

func depthVideoSubmit(cfg config.Config, w http.ResponseWriter, r *http.Request) {
	if strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
		depthVideoForm(cfg, w, r)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 48<<20))
	if err != nil || !json.Valid(body) {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"success": false, "submissionRejected": true, "error": "请求数据格式异常",
		})
		return
	}
	if message := depthVideoJSONError(body); message != "" {
		httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": message})
		return
	}
	var payload map[string]any
	_ = json.Unmarshal(body, &payload)
	operation := strings.TrimSpace(r.Header.Get("x-idempotency-key"))
	if operation == "" {
		operation, _ = payload["clientTaskId"].(string)
	}
	dataURL, _ := payload["videoDataUrl"].(string)
	videoURL, _ := payload["videoUrl"].(string)
	style, _ := payload["style"].(string)
	quality, _ := payload["quality"].(string)
	resolution, _ := payload["resolution"].(string)
	acceptDepthVideo(cfg, w, r, nil, dataURL, videoURL, style, quality, resolution, strings.TrimSpace(operation))
}

func depthVideoJSONError(body []byte) string {
	var raw any
	if json.Unmarshal(body, &raw) != nil {
		return "请求参数无效"
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return "Expected object, received " + generate.ZodReceived(raw)
	}
	if message := optionalMinString(obj, "videoDataUrl"); message != "" {
		return message
	}
	if message := optionalMinString(obj, "videoUrl"); message != "" {
		return message
	}
	if message := generate.OptionalEnum(obj, "style", "'mocap' | 'turbo' | 'raw'", "mocap", "turbo", "raw"); message != "" {
		return message
	}
	if message := generate.OptionalEnum(obj, "colormap", "'gray' | 'turbo'", "gray", "turbo"); message != "" {
		return message
	}
	if message := generate.OptionalEnum(obj, "resolution", "'480p' | '720p'", "480p", "720p"); message != "" {
		return message
	}
	if message := generate.OptionalEnum(obj, "quality", "'fast' | 'standard' | 'high'", "fast", "standard", "high"); message != "" {
		return message
	}
	if !trimmedPresent(obj, "videoDataUrl") && !trimmedPresent(obj, "videoUrl") {
		return "请提供 videoDataUrl 或 videoUrl"
	}
	return ""
}

func optionalMinString(obj map[string]any, key string) string {
	value, ok := obj[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return "Expected string, received " + generate.ZodReceived(value)
	}
	if text == "" {
		return "String must contain at least 1 character(s)"
	}
	return ""
}

func trimmedPresent(obj map[string]any, key string) bool {
	text, ok := obj[key].(string)
	return ok && strings.TrimSpace(text) != ""
}

func headerInt(raw string) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	end := 0
	for end < len(raw) && raw[end] >= '0' && raw[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	parsed, err := strconv.ParseInt(raw[:end], 10, 64)
	if err != nil {
		return 0
	}
	return parsed
}
