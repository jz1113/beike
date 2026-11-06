package generate

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

// VideoSilent derives a 15s silent delivery from an owned, completed H3 task.
// It never submits media to a model or overwrites the provider's original result.
func VideoSilent(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(code int, message string) {
			httpx.WriteJSON(w, code, map[string]any{"success": false, "error": message})
		}
		var body struct {
			TaskID string `json:"taskId"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || strings.TrimSpace(body.TaskID) == "" {
			fail(400, "请提供已完成的H3任务编号")
			return
		}
		db, err := openTaskDB(cfg)
		if err != nil {
			fail(503, "无法读取视频任务")
			return
		}
		defer db.Close()
		var recordID, source string
		err = db.QueryRowContext(r.Context(), `SELECT "id", "resultUrl" FROM "ImageTask" WHERE "workspaceId" = ? AND "taskId" = ? AND "mediaType" = 'video' AND "model" = 'MiniMax-H3' AND "status" = 'SUCCESS' LIMIT 1`, workspaceOf(r), body.TaskID).Scan(&recordID, &source)
		if err != nil || source == "" {
			fail(404, "未找到当前工作区已完成的H3视频")
			return
		}
		binary, ok := system.FFmpegBinary(cfg.Root)
		if !ok {
			fail(503, "FFmpeg未就绪，模型原片已保留；修复视频环境后可重新处理，无需重新生成")
			return
		}
		rel := storage.WorkspaceKey("azhuo/generated/videos/w3-silent/"+videoDiagnosticDigest([]byte(recordID+"\x00"+source+"\x00v1"))+".mp4", workspaceOf(r))
		output := storage.SafeWithin(storage.ResolveRoot(), rel)
		if output == "" {
			fail(500, "成片保存位置无效")
			return
		}
		respond := func() {
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "url": "/storage/" + rel, "durationSec": 15, "hasAudio": false})
		}
		if probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, output); err == nil && validSilentDelivery(probe) {
			respond()
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
		defer cancel()
		data, err := readSilentSource(ctx, cfg, source, workspaceOf(r))
		if err != nil {
			fail(502, "模型视频读取失败，原任务已保留，请稍后重新处理，无需重新生成")
			return
		}
		dir, err := os.MkdirTemp("", "beike-w3-silent-*")
		if err != nil {
			fail(500, "无法准备成片临时目录")
			return
		}
		defer os.RemoveAll(dir)
		input, temporary := filepath.Join(dir, "input.mp4"), filepath.Join(dir, "output.mp4")
		if os.WriteFile(input, data, 0600) != nil {
			fail(500, "模型视频保存失败")
			return
		}
		probe, err := system.ProbeLocalVideo(ctx, cfg.Root, input)
		if err != nil || probe.Duration < 15 || probe.Duration > 16 || min(probe.Width, probe.Height) != 768 {
			fail(422, "模型返回视频不满足15秒768P要求，原任务已保留")
			return
		}
		cmd := exec.CommandContext(ctx, binary, "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", input,
			"-map", "0:v:0", "-an", "-t", "15", "-r", "24", "-frames:v", "360", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", temporary)
		cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
		if cmd.Run() != nil {
			fail(500, "去音轨处理失败，模型原片已保留")
			return
		}
		finished, err := system.ProbeLocalVideo(ctx, cfg.Root, temporary)
		if err != nil || !validSilentDelivery(finished) {
			fail(500, "成片时长、分辨率或音轨校验失败，模型原片已保留")
			return
		}
		data, err = os.ReadFile(temporary)
		if err != nil || writeSilentDelivery(output, data) != nil {
			fail(500, "无声成片保存失败，模型原片已保留")
			return
		}
		respond()
	}
}

func validSilentDelivery(probe system.VideoProbe) bool {
	return !probe.HasAudio && math.Abs(probe.Duration-15) < 0.001 && min(probe.Width, probe.Height) == 768
}

func readSilentSource(ctx context.Context, cfg config.Config, source, workspace string) ([]byte, error) {
	if strings.HasPrefix(source, "/storage/") {
		rel := strings.TrimPrefix(source, "/storage/")
		if !storage.WorkspaceRel(rel, workspace, !cfg.Production()) {
			return nil, errors.New("invalid storage scope")
		}
		file := storage.SafeWithin(storage.ResolveRoot(), rel)
		if file == "" {
			return nil, errors.New("invalid storage path")
		}
		input, err := os.Open(file)
		if err != nil {
			return nil, err
		}
		defer input.Close()
		return readSilentBytes(input)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	res, err := network.SafeClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Range") != "" {
		return nil, errors.New("incomplete video")
	}
	return readSilentBytes(res.Body)
}

func readSilentBytes(r io.Reader) ([]byte, error) {
	const maxVideo = 200 << 20
	data, err := io.ReadAll(io.LimitReader(r, maxVideo+1))
	if err != nil || len(data) == 0 || len(data) > maxVideo {
		return nil, errors.New("invalid video size")
	}
	return data, nil
}

func writeSilentDelivery(output string, data []byte) error {
	dir := filepath.Dir(output)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".w3-delivery-*.mp4")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, err = file.Write(data)
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(file.Name(), output)
}
