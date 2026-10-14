package depth

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/system"
)

type depthRuntime struct {
	Progress string
	Stage    string
	Meta     depthMeta
}

type depthVideoJob struct {
	cfg       config.Config
	workspace string
	recordID  string
	data      []byte
	dataURL   string
	videoURL  string
	style     string
	quality   string
}

var (
	depthVideoMu       sync.Mutex
	depthVideoQueue    []depthVideoJob
	depthVideoRunning  bool
	depthVideoShutdown bool
	depthVideoCurrent  chan struct{}
	depthVideoState    sync.Map
)

func acceptDepthVideo(cfg config.Config, w http.ResponseWriter, r *http.Request, data []byte, dataURL, videoURL, style, quality, operation string) {
	style = resolveDepthStyle(style, "")
	quality = resolveDepthQuality(quality)
	fingerprint := depthFingerprint("depth-video", depthInputDigest(append(append([]byte{}, data...), []byte(dataURL+videoURL)...)), style, quality)
	status, body := guardDepth(cfg, r, "depth-video", operation, fingerprint, func() (int, map[string]any) {
		recordID, err := createDepthVideoRecord(cfg, r, quality)
		if err != nil {
			return http.StatusInternalServerError, map[string]any{"success": false, "submissionRejected": true, "error": "深度动作捕捉任务提交失败"}
		}
		enqueueDepthVideo(depthVideoJob{cfg: cfg, workspace: httpx.WorkspaceFrom(r), recordID: recordID, data: append([]byte{}, data...), dataURL: dataURL, videoURL: videoURL, style: style, quality: quality})
		return http.StatusOK, map[string]any{"success": true, "taskId": recordID, "recordId": recordID, "status": "IN_PROGRESS", "style": style, "quality": quality}
	})
	httpx.WriteJSON(w, status, body)
}

func createDepthVideoRecord(cfg config.Config, r *http.Request, quality string) (string, error) {
	db, err := httpx.OpenDB(cfg)
	if err != nil {
		return "", err
	}
	defer db.Close()
	id := depthTaskID()
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err = db.ExecContext(r.Context(), `
		INSERT INTO "ImageTask" ("id","workspaceId","taskId","prompt","model","mediaType","quality","status","createdAt","updatedAt")
		VALUES (?,?,?,?,?,?,?,?,?,?)`,
		id, httpx.WorkspaceFrom(r), id, "深度动作捕捉", "video-depth-anything", "depth-video", quality, "IN_PROGRESS", now, now)
	return id, err
}

func enqueueDepthVideo(job depthVideoJob) {
	depthVideoMu.Lock()
	defer depthVideoMu.Unlock()
	if depthVideoShutdown {
		return
	}
	setDepthRuntime(job.recordID, "queued", "5%", depthMeta{})
	depthVideoQueue = append(depthVideoQueue, job)
	if !depthVideoRunning {
		depthVideoRunning = true
		go processDepthVideoQueue()
	}
}

func processDepthVideoQueue() {
	for {
		depthVideoMu.Lock()
		if depthVideoShutdown || len(depthVideoQueue) == 0 {
			depthVideoRunning = false
			depthVideoMu.Unlock()
			return
		}
		job := depthVideoQueue[0]
		depthVideoQueue = depthVideoQueue[1:]
		done := make(chan struct{})
		depthVideoCurrent = done
		depthVideoMu.Unlock()
		runDepthVideoJob(job)
		close(done)
		depthVideoMu.Lock()
		depthVideoCurrent = nil
		depthVideoMu.Unlock()
	}
}

func DrainDepthVideo(timeout time.Duration) {
	depthVideoMu.Lock()
	depthVideoShutdown = true
	current := depthVideoCurrent
	depthVideoMu.Unlock()
	if current == nil {
		return
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-current:
	case <-timer.C:
	}
}

func runDepthVideoJob(job depthVideoJob) {
	work, err := os.MkdirTemp("", "depth-video-")
	if err != nil {
		failDepthVideo(job, "深度动作捕捉任务提交失败")
		return
	}
	defer os.RemoveAll(work)
	setDepthRuntime(job.recordID, "probing", "8%", depthMeta{})
	input, err := writeDepthVideoInput(work, job)
	if err != nil {
		failDepthVideo(job, err.Error())
		return
	}
	probe, err := system.ProbeVideo(job.cfg.Root, input)
	if err != nil {
		failDepthVideo(job, err.Error())
		return
	}
	if probe.Duration > 30 {
		failDepthVideo(job, "视频时长超过 30s 限制")
		return
	}
	profile := depthQualityProfile(job.quality)
	frames := filepath.Join(work, "frames")
	depthDir := filepath.Join(work, "depth")
	output := filepath.Join(work, "output.mp4")
	setDepthRuntime(job.recordID, "extracting", "15%", depthMeta{})
	count, fps, err := extractDepthFrames(job.cfg.Root, input, frames, profile.maxWidthPx)
	if err != nil {
		failDepthVideo(job, err.Error())
		return
	}
	setDepthRuntime(job.recordID, "inferring", "25%", depthMeta{})
	var meta depthMeta
	parsed, err := runDepthPython(job.cfg.Root, "frames", job.style, job.quality, map[string]string{"frames": frames, "depth": depthDir}, func(frame, total int) {
		setDepthRuntime(job.recordID, "inferring", formatDepthProgress(frame, total), meta)
	}, func(next depthMeta) {
		meta = next
		setDepthRuntime(job.recordID, "inferring", "25%", next)
	})
	if err != nil {
		failDepthVideo(job, err.Error())
		return
	}
	if parsed.ModelID != "" {
		meta = parsed
	}
	if countPNG(depthDir) != count {
		failDepthVideo(job, "深度帧数量不匹配")
		return
	}
	setDepthRuntime(job.recordID, "encoding", "92%", meta)
	if err := encodeDepthFrames(job.cfg.Root, depthDir, output, fps, profile.videoCrf, profile.preset); err != nil {
		failDepthVideo(job, err.Error())
		return
	}
	setDepthRuntime(job.recordID, "uploading", "96%", meta)
	encoded, err := os.ReadFile(output)
	if err != nil {
		failDepthVideo(job, "深度视频生成失败：无输出文件")
		return
	}
	resultURL, err := persistDepthBytes(job.cfg, job.workspace, "video/mp4", encoded, "depth_"+job.recordID+".mp4")
	if err != nil {
		failDepthVideo(job, "深度视频生成失败")
		return
	}
	markDepthVideo(job, "SUCCESS", resultURL, "")
	setDepthRuntime(job.recordID, "done", "100%", meta)
}

func writeDepthVideoInput(work string, job depthVideoJob) (string, error) {
	target := filepath.Join(work, "input.mp4")
	if len(job.data) > 0 {
		return target, os.WriteFile(target, job.data, 0o600)
	}
	if strings.HasPrefix(job.dataURL, "data:") {
		comma := strings.Index(job.dataURL, ",")
		if comma < 0 {
			return "", errors.New("无效的视频 data URL")
		}
		raw, err := base64.StdEncoding.DecodeString(job.dataURL[comma+1:])
		if err != nil {
			return "", errors.New("无效的视频 data URL")
		}
		if len(raw) > depthVideoFileBytes {
			return "", errors.New("视频过大，请控制在 35MB 以内")
		}
		return target, os.WriteFile(target, raw, 0o600)
	}
	if job.videoURL != "" {
		if blockedDepthHost(job.videoURL) {
			return "", errors.New("下载视频失败")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, job.videoURL, nil)
		if err != nil {
			return "", errors.New("下载视频失败")
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", errors.New("下载视频失败")
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return "", errors.New("下载视频失败 (HTTP " + strconv.Itoa(resp.StatusCode) + ")")
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, int64(depthVideoFileBytes)+1))
		if err != nil {
			return "", errors.New("下载视频失败")
		}
		if len(body) > depthVideoFileBytes {
			return "", errors.New("视频过大，请控制在 35MB 以内")
		}
		return target, os.WriteFile(target, body, 0o600)
	}
	return "", errors.New("缺少视频输入")
}

func blockedDepthHost(raw string) bool {
	host := raw
	if strings.Contains(raw, "://") {
		parts := strings.SplitN(raw, "://", 2)
		host = parts[1]
	}
	host = strings.Split(host, "/")[0]
	host = strings.Split(host, ":")[0]
	if host == "localhost" || strings.HasSuffix(host, ".local") || host == "" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified())
}

func failDepthVideo(job depthVideoJob, message string) {
	markDepthVideo(job, "FAILURE", "", message)
	setDepthRuntime(job.recordID, "failed", "0%", depthMeta{})
}

func markDepthVideo(job depthVideoJob, status, resultURL, reason string) {
	db, err := httpx.OpenDB(job.cfg)
	if err != nil {
		return
	}
	defer db.Close()
	_, _ = db.Exec(`UPDATE "ImageTask" SET "status" = ?, "resultUrl" = ?, "failReason" = ? WHERE "id" = ? AND "status" = 'IN_PROGRESS'`,
		status, nullable(resultURL), nullable(reason), job.recordID)
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func setDepthRuntime(id, stage, progress string, meta depthMeta) {
	prev, _ := depthVideoState.Load(id)
	if meta.ModelID == "" {
		if old, ok := prev.(depthRuntime); ok {
			meta = old.Meta
		}
	}
	depthVideoState.Store(id, depthRuntime{Progress: progress, Stage: stage, Meta: meta})
}
