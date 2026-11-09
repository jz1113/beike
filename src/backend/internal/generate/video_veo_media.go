package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const veoVideoLimit = 128 << 20

var veoMediaHTTP = network.SafeClient

func readVeoMedia(ctx context.Context, cfg config.Config, source, workspace string, limit int64) ([]byte, error) {
	var reader io.ReadCloser
	switch {
	case strings.HasPrefix(source, "data:"):
		head, data, ok := strings.Cut(source, ",")
		if !ok || !strings.HasSuffix(head, ";base64") || len(data) > base64.StdEncoding.EncodedLen(int(limit)) {
			return nil, errors.New("Veo 素材为空或超过大小限制")
		}
		body, err := base64.StdEncoding.DecodeString(data)
		if err != nil || len(body) == 0 || int64(len(body)) > limit {
			return nil, errors.New("Veo 素材编码无效或超过大小限制")
		}
		return body, nil
	case strings.HasPrefix(source, "/storage/"):
		path, err := resolveSeedanceLocalVideoPath(source, workspace, cfg.Production())
		if err != nil {
			return nil, err
		}
		reader, err = os.Open(path)
		if err != nil {
			return nil, errors.New("Veo 素材无法读取")
		}
	default:
		u, err := url.Parse(source)
		if err != nil || u.User != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, errors.New("Veo 素材需要公网地址或当前工作区素材")
		}
		ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		res, err := veoMediaHTTP().Do(req)
		if err != nil {
			return nil, errors.New("Veo 素材下载失败，请检查素材地址")
		}
		if res.StatusCode != http.StatusOK || res.Header.Get("Content-Range") != "" {
			res.Body.Close()
			return nil, errors.New("Veo 素材未返回完整文件")
		}
		reader = res.Body
	}
	defer reader.Close()
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil || len(body) == 0 || int64(len(body)) > limit {
		return nil, errors.New("Veo 素材为空、读取失败或超过大小限制")
	}
	return body, nil
}

func prepareVeoNativeMedia(ctx context.Context, cfg config.Config, body map[string]any, workspace string) error {
	instances, _ := body["instances"].([]map[string]any)
	prepare := func(node map[string]string, video bool) error {
		if node["gcsUri"] != "" {
			return nil
		}
		limit := int64(20 << 20)
		if video {
			limit = veoVideoLimit
		}
		data, err := readVeoMedia(ctx, cfg, node["url"], workspace, limit)
		if err != nil {
			return err
		}
		mime := http.DetectContentType(data)
		if video {
			if len(data) < 12 || string(data[4:8]) != "ftyp" {
				return errors.New("Veo 原生延长需要 MP4 视频")
			}
			if err := validateVeoNativeClip(cfg, data); err != nil {
				return err
			}
			mime = "video/mp4"
		} else if mime != "image/png" && mime != "image/jpeg" {
			return errors.New("Veo 官方首帧和参考图片需要 PNG 或 JPEG")
		}
		node["bytesBase64Encoded"] = base64.StdEncoding.EncodeToString(data)
		node["mimeType"] = mime
		delete(node, "url")
		return nil
	}
	for _, instance := range instances {
		for _, key := range []string{"image", "lastFrame", "video"} {
			if node, ok := instance[key].(map[string]string); ok {
				if err := prepare(node, key == "video"); err != nil {
					return err
				}
			}
		}
		if refs, ok := instance["referenceImages"].([]map[string]any); ok {
			for _, ref := range refs {
				if err := prepare(ref["image"].(map[string]string), false); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func veoStorageRoot(cfg config.Config) string {
	if root := strings.TrimSpace(os.Getenv("AZHUO_CACHE_DIR")); root != "" {
		return root
	}
	if dir := cfg.DataDir(); dir != "" {
		return filepath.Join(dir, "storage")
	}
	return storage.ResolveRoot()
}

func veoResultLocation(cfg config.Config, workspace, key string) (string, string, error) {
	rel := workspace + "/azhuo/generated/videos/veo/" + videoDiagnosticDigest([]byte(key)) + ".mp4"
	path := storage.SafeWithin(veoStorageRoot(cfg), rel)
	if path == "" {
		return "", "", errors.New("Veo 视频存储位置无效")
	}
	return path, "/storage/" + rel, nil
}

func writeVeoFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".veo-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func validateVeoNativeClip(cfg config.Config, data []byte) error {
	file, err := os.CreateTemp("", "beike-veo-source-*.mp4")
	if err != nil {
		return errors.New("Veo 原片预检无法写入临时文件")
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	file.Close()
	probe, err := system.ProbeVideo(cfg.Root, file.Name())
	if err != nil {
		return errors.New("Veo 原生延长需要有效的 MP4 视频")
	}
	if probe.Duration < 1 || probe.Duration > 30.1 || math.Abs(probe.FPS-24) > 0.05 {
		return errors.New("Veo 原生延长要求原片 1–30 秒、24 fps")
	}
	short, long := probe.Width, probe.Height
	if short > long {
		short, long = long, short
	}
	if !(short == 720 && long == 1280 || short == 1080 && long == 1920 || short == 2160 && long == 3840) {
		return errors.New("Veo 原生延长要求 16:9 或 9:16 的 720P、1080P、4K 原片")
	}
	return nil
}

type veoJoinState struct {
	running bool
	attempt time.Time
	reason  string
}

var veoJoins = struct {
	sync.Mutex
	jobs map[string]*veoJoinState
}{jobs: map[string]*veoJoinState{}}

func queueVeoJoin(cfg config.Config, workspace, recordID, continuation string, plan veoExtensionPlan) pollParsed {
	path, stored, err := veoResultLocation(cfg, workspace, "extension:"+recordID)
	if err != nil {
		return pollParsed{status: "IN_PROGRESS", progress: "95%", reason: err.Error()}
	}
	if info, err := os.Stat(path); err == nil && info.Size() > 0 {
		return pollParsed{status: "SUCCESS", progress: "100%", result: stored}
	}
	dir := veoExtensionDir(cfg, workspace, recordID)
	veoJoins.Lock()
	defer veoJoins.Unlock()
	state := veoJoins.jobs[dir]
	if state == nil {
		state = &veoJoinState{}
		veoJoins.jobs[dir] = state
	}
	if !state.running && (state.attempt.IsZero() || time.Since(state.attempt) > 30*time.Second) {
		state.running = true
		state.attempt = time.Now()
		state.reason = "续段已生成，正在拼接原片"
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
			defer cancel()
			err := joinVeoExtension(ctx, cfg, workspace, dir, continuation, path, plan)
			veoJoins.Lock()
			defer veoJoins.Unlock()
			state.running = false
			if err != nil {
				state.reason = err.Error() + "；将继续恢复拼接，无需重新生成"
			} else {
				delete(veoJoins.jobs, dir)
			}
			for key, job := range veoJoins.jobs {
				if !job.running && time.Since(job.attempt) > time.Hour {
					delete(veoJoins.jobs, key)
				}
			}
		}()
	}
	return pollParsed{status: "IN_PROGRESS", progress: "95%", reason: state.reason}
}

func joinVeoExtension(ctx context.Context, cfg config.Config, workspace, dir, continuation, output string, plan veoExtensionPlan) error {
	body, err := readVeoMedia(ctx, cfg, continuation, workspace, veoVideoLimit)
	if err != nil {
		return err
	}
	next := filepath.Join(dir, "continuation.mp4")
	if err = writeVeoFile(next, body); err != nil {
		return errors.New("续段保存失败")
	}
	defer os.Remove(next)
	probe, err := system.ProbeVideo(cfg.Root, next)
	if err != nil {
		return err
	}
	if probe.Duration <= 0 || probe.Duration > 30 || probe.Width <= 0 || probe.Height <= 0 {
		return errors.New("延长续段不是完整的有效视频")
	}
	binary, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		return errors.New("视频拼接需要 FFmpeg")
	}
	if err = os.MkdirAll(filepath.Dir(output), 0o700); err != nil {
		return errors.New("拼接视频目录无法写入")
	}
	file, err := os.CreateTemp(filepath.Dir(output), ".veo-join-*.mp4")
	if err != nil {
		return err
	}
	tmp := file.Name()
	file.Close()
	defer os.Remove(tmp)
	width, height := probe.Width/2*2, probe.Height/2*2
	// Bound the local transcode while retaining the chosen aspect ratio.
	if math.Max(float64(width), float64(height)) > 3840 {
		factor := 3840 / math.Max(float64(width), float64(height))
		width = int(float64(width)*factor) / 2 * 2
		height = int(float64(height)*factor) / 2 * 2
	}
	sourceDuration := plan.Source.VideoDuration
	if sourceDuration <= 0 {
		sourceDuration = plan.Source.Duration
	}
	nextDuration := probe.VideoDuration
	if nextDuration <= 0 {
		nextDuration = probe.Duration
	}
	var graph []string
	for index, seconds := range []float64{sourceDuration, nextDuration} {
		graph = append(graph, fmt.Sprintf("[%d:v:0]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p,trim=duration=%.6f,settb=AVTB,setpts=PTS-STARTPTS[v%d]", index, width, height, width, height, seconds, index))
		hasAudio := plan.Source.HasAudio
		if index == 1 {
			hasAudio = probe.HasAudio
		}
		audio := fmt.Sprintf("anullsrc=r=48000:cl=stereo,atrim=duration=%.6f", seconds)
		if hasAudio {
			audio = fmt.Sprintf("[%d:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=%.6f", index, seconds)
		}
		graph = append(graph, fmt.Sprintf("%s,asetpts=PTS-STARTPTS[a%d]", audio, index))
	}
	graph = append(graph, "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]")
	cmd := exec.CommandContext(ctx, binary, "-nostdin", "-v", "error", "-y", "-i", filepath.Join(dir, "source.mp4"), "-i", next, "-filter_complex", strings.Join(graph, ";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", tmp)
	if err = cmd.Run(); err != nil {
		return errors.New("续段已生成，但视频拼接未完成")
	}
	result, err := system.ProbeVideo(cfg.Root, tmp)
	if err != nil || result.Duration < sourceDuration+nextDuration-0.2 || !result.HasAudio {
		return errors.New("拼接成片校验失败")
	}
	if err = os.Rename(tmp, output); err != nil {
		return errors.New("拼接成片保存失败")
	}
	return nil
}
