package sales

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

const scriptVideoUploadLimit = 64 << 20

var scriptVideoMIME = map[string]string{".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}

// Only uploaded workspace videos are read; browser blobs and arbitrary paths are rejected.
func localScriptVideoFile(source, workspace string) (string, error) {
	path := strings.SplitN(strings.SplitN(strings.TrimSpace(source), "?", 2)[0], "#", 2)[0]
	if !strings.HasPrefix(path, "/storage/") {
		return "", errors.New("只接受已上传到当前工作区的参考视频")
	}
	rel := strings.TrimPrefix(path, "/storage/")
	if !storage.WorkspaceRel(rel, workspace, true) {
		return "", errors.New("参考视频不属于当前工作区")
	}
	file := storage.StoredFile(rel)
	if file == "" {
		return "", errors.New("参考视频不在工作区存储中，请重新上传")
	}
	if scriptVideoMIME[strings.ToLower(filepath.Ext(file))] == "" {
		return "", errors.New("参考视频支持 MP4、MOV 和 WebM")
	}
	return file, nil
}

func scriptAspectRatio(width, height int) string {
	if width <= 0 || height <= 0 {
		return "9:16"
	}
	ratio := float64(width) / float64(height)
	best, diff := "9:16", 10.0
	for name, value := range map[string]float64{"9:16": 9.0 / 16, "16:9": 16.0 / 9, "3:4": 3.0 / 4, "1:1": 1} {
		if d := ratio - value; d*d < diff {
			best, diff = name, d*d
		}
	}
	return best
}

func fileHash(path string) string {
	handle, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer handle.Close()
	digest := sha256.New()
	if _, err := io.Copy(digest, handle); err != nil {
		return ""
	}
	return hex.EncodeToString(digest.Sum(nil)[:16])
}

// ScriptVideoUpload keeps reference videos available for script analysis and linked depth conversion.
func ScriptVideoUpload(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		r.Body = http.MaxBytesReader(w, r.Body, scriptVideoUploadLimit+1<<20)
		if _, params, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || params["boundary"] == "" {
			fail(400, "请选择要上传的参考视频")
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			fail(400, "参考视频超过 64 MB 或上传中断，请压缩后重试")
			return
		}
		defer file.Close()
		ext := strings.ToLower(filepath.Ext(header.Filename))
		if scriptVideoMIME[ext] == "" {
			fail(400, "参考视频支持 MP4、MOV 和 WebM")
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/refs/sales-script/%s/%s%s", time.Now().Format("200601"), httpx.RequestID(), ext), workspace)
		absolute := storage.SafeWithin(storage.ResolveRoot(), rel)
		if absolute == "" || os.MkdirAll(filepath.Dir(absolute), 0o755) != nil {
			fail(500, "参考视频保存失败")
			return
		}
		if err := saveScriptUpload(file, absolute); err != nil {
			fail(400, err.Error())
			return
		}
		probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, absolute)
		if err != nil || probe.Width <= 0 || probe.Height <= 0 || probe.Duration <= 0 {
			_ = os.Remove(absolute)
			fail(400, "无法读取视频画面，请确认文件未损坏")
			return
		}
		info, _ := os.Stat(absolute)
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "videoUrl": "/storage/" + rel, "videoHash": fileHash(absolute),
			"durationSec": roundTenth(probe.Duration), "aspectRatio": scriptAspectRatio(probe.Width, probe.Height), "hasAudio": probe.HasAudio, "sizeBytes": info.Size()})
	}
}

func saveScriptUpload(file multipart.File, absolute string) error {
	out, err := os.Create(absolute)
	if err != nil {
		return errors.New("参考视频保存失败")
	}
	written, copyErr := io.Copy(out, io.LimitReader(file, scriptVideoUploadLimit+1))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil || written == 0 || written > scriptVideoUploadLimit {
		_ = os.Remove(absolute)
		if written > scriptVideoUploadLimit {
			return errors.New("参考视频超过 64 MB，请压缩或截取后再上传")
		}
		return errors.New("参考视频保存失败")
	}
	return nil
}

func roundTenth(value float64) float64 {
	return float64(int(value*10+0.5)) / 10
}

func discardSourcePreviewLinks(script map[string]any) {
	shots, _ := script["shots"].([]any)
	for _, rawShot := range shots {
		shot, _ := rawShot.(map[string]any)
		beats, _ := shot["beats"].([]any)
		for _, rawBeat := range beats {
			beat, _ := rawBeat.(map[string]any)
			delete(beat, "previewFrameUrl")
		}
	}
}

// enrichScriptMedia replaces model guesses with measured duration/audio/ratio.
func enrichScriptMedia(ctx context.Context, root, workspace, videoURL string, script map[string]any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	discardSourcePreviewLinks(script)
	path, err := localScriptVideoFile(videoURL, workspace)
	if err != nil || script == nil {
		return nil
	}
	probe, err := system.ProbeLocalVideo(ctx, root, path)
	if err != nil {
		return nil
	}
	if probe.Duration > 0 {
		script["durationSec"] = roundTenth(probe.Duration)
	}
	script["audioAvailable"] = probe.HasAudio
	visual, _ := script["visualSpec"].(map[string]any)
	if visual == nil {
		visual = map[string]any{}
	}
	visual["aspectRatio"] = scriptAspectRatio(probe.Width, probe.Height)
	script["visualSpec"] = visual
	if !probe.HasAudio {
		script["voiceMode"] = "none"
	}
	// Measured metadata may invalidate an otherwise self-consistent model timeline.
	// Reject it before saving an unusable draft.
	if _, err := validateScriptObject(script); err != nil {
		return fmt.Errorf("分镜时间轴与参考视频实测时长不符：%w", err)
	}
	return ctx.Err()
}
