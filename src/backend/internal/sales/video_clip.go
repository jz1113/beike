package sales

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

const videoClipMaxBytes = 200 << 20

type videoClipRequest struct {
	SourceURL      string   `json:"sourceUrl"`
	EndSec         float64  `json:"endSec"`
	MaxDurationSec *float64 `json:"maxDurationSec,omitempty"`
}

// VideoClip derives a silent prefix at an already selected complete-action
// boundary. It never changes playback speed or overwrites the original video.
func VideoClip(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body videoClipRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF ||
			math.IsNaN(body.EndSec) || math.IsInf(body.EndSec, 0) || body.EndSec < 0.1 || body.EndSec > 600 {
			fail(400, "请提供参考视频和 0.1—600 秒内的完整动作结束时间")
			return
		}
		if body.MaxDurationSec != nil && (math.IsNaN(*body.MaxDurationSec) || math.IsInf(*body.MaxDurationSec, 0) ||
			*body.MaxDurationSec < body.EndSec || *body.MaxDurationSec > 600) {
			fail(400, "动作参考时长上限必须不短于动作结束时间，且不超过 600 秒")
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		input, err := localClipVideoFile(cfg.Root, body.SourceURL, workspace)
		if err != nil {
			fail(400, err.Error())
			return
		}
		probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, input)
		if err != nil || probe.Duration <= 0 {
			fail(400, "无法读取深度参考视频的时长，请重新转换或上传")
			return
		}
		if body.EndSec > probe.Duration+0.06 {
			fail(400, fmt.Sprintf("动作结束时间 %.2f 秒超过参考视频 %.2f 秒，请重新核对脚本", body.EndSec, probe.Duration))
			return
		}
		ffmpeg, ok := system.FFmpegBinary(cfg.Root)
		if !ok {
			fail(503, "当前环境未就绪 FFmpeg，暂无法准备动作参考片段")
			return
		}
		end := math.Min(body.EndSec, probe.Duration)
		hash := fileHash(input)
		if hash == "" {
			fail(500, "无法读取动作参考视频")
			return
		}
		maxKey := "auto"
		if body.MaxDurationSec != nil {
			maxKey = strconv.FormatFloat(*body.MaxDurationSec, 'f', 3, 64)
		}
		rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/refs/sales-script/clips/%s-%s-%s-v2.mp4", hash, strconv.FormatFloat(end, 'f', 3, 64), maxKey), workspace)
		output, err := prepareClipOutput(rel)
		if err != nil {
			fail(500, "无法创建动作片段输出目录")
			return
		}
		respond := func(duration float64) {
			httpx.WriteJSON(w, 200, map[string]any{"success": true, "url": "/storage/" + rel,
				"startSec": 0, "endSec": body.EndSec, "durationSec": duration})
		}
		if cached, err := system.ProbeLocalVideo(r.Context(), cfg.Root, output); err == nil && validClipProbe(cached, end, probe.FPS, body.MaxDurationSec) {
			respond(cached.Duration)
			return
		}
		temporary, err := os.CreateTemp(filepath.Dir(output), ".sales-clip-*.mp4")
		if err != nil {
			fail(500, "无法创建动作片段临时文件")
			return
		}
		tmp := temporary.Name()
		_ = temporary.Close()
		defer os.Remove(tmp)
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, ffmpeg, clipFFmpegArgs(input, tmp, end, probe.FPS, body.MaxDurationSec)...)
		cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
		if cmd.Run() != nil {
			fail(500, "动作参考片段准备失败，请检查视频编码或重试")
			return
		}
		clipped, err := system.ProbeLocalVideo(r.Context(), cfg.Root, tmp)
		if err != nil || !validClipProbe(clipped, end, probe.FPS, body.MaxDurationSec) {
			fail(500, "动作参考片段时长核对失败，原视频已保留")
			return
		}
		if err := os.Rename(tmp, output); err != nil {
			fail(500, "动作参考片段保存失败，原视频已保留")
			return
		}
		respond(clipped.Duration)
	}
}

func validClipProbe(probe system.VideoProbe, end, fps float64, maximum *float64) bool {
	if fps <= 0 {
		fps = 24
	}
	return (maximum == nil || probe.Duration <= *maximum+0.001) && !probe.HasAudio && probe.Width > 0 && probe.Height > 0 && probe.Duration > 0 &&
		math.Abs(probe.Duration-end) <= 1/fps+0.025
}

func clipFFmpegArgs(input, output string, end, fps float64, maximum *float64) []string {
	if fps <= 0 {
		fps = 24
	}
	// A frame whose presentation time is before the boundary can otherwise
	// extend the container past it (for example 15.015 seconds at 29.97 fps).
	// Keep only complete frames; timestamps and playback speed stay unchanged.
	args := []string{"-y", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", input,
		"-t", strconv.FormatFloat(end, 'f', 6, 64)}
	if maximum != nil {
		frames := max(1, int(math.Floor(*maximum*fps+1e-7)))
		args = append(args, "-frames:v", strconv.Itoa(frames))
	}
	return append(args, "-map", "0:v:0", "-an", "-vsync", "0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
		"-pix_fmt", "yuv420p", "-movflags", "+faststart", output)
}

func localClipVideoFile(root, source, workspace string) (string, error) {
	path := strings.SplitN(strings.SplitN(strings.TrimSpace(source), "?", 2)[0], "#", 2)[0]
	if !strings.HasPrefix(path, "/storage/") {
		return "", errors.New("动作片段仅接受当前工作区已保存的本地参考视频")
	}
	rel := strings.TrimPrefix(path, "/storage/")
	if !storage.WorkspaceRel(rel, workspace, workspace == "local") {
		return "", errors.New("参考视频不属于当前工作区")
	}
	if scriptVideoMIME[strings.ToLower(filepath.Ext(rel))] == "" {
		return "", errors.New("动作参考视频支持 MP4、MOV 和 WebM")
	}
	for _, directory := range []string{storage.ResolveRoot(), filepath.Join(root, ".azhuo_storage")} {
		candidate := clipPathWithin(directory, rel)
		if candidate == "" {
			continue
		}
		info, err := os.Stat(candidate)
		if err == nil && info.Mode().IsRegular() && info.Size() > 0 && info.Size() <= videoClipMaxBytes {
			return candidate, nil
		}
	}
	return "", errors.New("参考视频不存在、超出 200 MB 或不在工作区存储中，请重新转换或上传")
}

// Reject symlinks inside a storage tree, including cross-workspace aliases.
func clipPathWithin(root, rel string) string {
	candidate := storage.SafeWithin(root, rel)
	realRoot, err := filepath.EvalSymlinks(root)
	if candidate == "" || err != nil {
		return ""
	}
	realRoot, err = filepath.Abs(realRoot)
	if err != nil {
		return ""
	}
	realCandidate, err := filepath.EvalSymlinks(candidate)
	if err != nil || realCandidate != storage.SafeWithin(realRoot, rel) {
		return ""
	}
	return realCandidate
}

func prepareClipOutput(rel string) (string, error) {
	root := storage.ResolveRoot()
	output := storage.SafeWithin(root, rel)
	if output == "" {
		return "", errors.New("invalid output path")
	}
	if err := os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
		return "", err
	}
	parentRel := filepath.Dir(rel)
	if clipPathWithin(root, parentRel) == "" {
		return "", errors.New("output directory is outside storage")
	}
	if info, err := os.Lstat(output); err == nil && !info.Mode().IsRegular() {
		return "", errors.New("output is not a regular file")
	}
	return output, nil
}

// Normalize only the delivered result. Provider URLs can expire after the job finishes.
func storeSalesVideoResult(ctx context.Context, cfg config.Config, workspace, source string, speech bool, expected float64) (string, error) {
	input, cleanup, err := resolveAudioMixMedia(ctx, source, workspace, true, network.SafeClient())
	defer cleanup()
	if err != nil {
		return "", err
	}
	probe, err := system.ProbeLocalVideo(ctx, cfg.Root, input)
	if err != nil || probe.Width <= 0 || probe.Height <= 0 || probe.Duration <= 0 {
		return "", errors.New("原片缺少有效画面或时长")
	}
	duration := probe.VideoDuration
	if duration <= 0 {
		duration = probe.Duration
	}
	if expected > 0 && math.Abs(duration-expected) > math.Max(0.25, 2/probe.FPS) {
		return "", fmt.Errorf("渠道画面时长 %.2f 秒，与请求 %.2f 秒不符；请核对原片", duration, expected)
	}
	if speech && !probe.HasAudio {
		return "", errors.New("真人口播原片缺少音轨")
	}
	ffmpeg, ok := system.FFmpegBinary(cfg.Root)
	if !ok {
		return "", errors.New("FFmpeg 不可用")
	}
	if speech {
		if err := checkSalesAudioSignal(ctx, ffmpeg, input); err != nil {
			return "", err
		}
	}
	rel := storage.WorkspaceKey("azhuo/generated/videos/"+time.Now().Format("200601")+"/sales_"+httpx.RequestID()+".mp4", workspace)
	output := storage.SafeWithin(storage.ResolveRoot(), rel)
	if output == "" || os.MkdirAll(filepath.Dir(output), 0755) != nil {
		return "", errors.New("无法创建成片目录")
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	args := append([]string{"-v", "error", "-xerror", "-y"}, audioMixInputArgs(input)...)
	args = append(args, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output)
	if exec.CommandContext(ctx, ffmpeg, args...).Run() != nil {
		os.Remove(output)
		return "", errors.New("视频解码或保存失败")
	}
	delivered, err := system.ProbeLocalVideo(ctx, cfg.Root, output)
	if err != nil || delivered.Width <= 0 || delivered.Duration <= 0 || delivered.HasAudio != probe.HasAudio || delivered.Duration+0.15 < probe.Duration {
		os.Remove(output)
		return "", errors.New("成片轨道或时长不完整")
	}
	return "/storage/" + rel, nil
}

func VideoReview(cfg config.Config) http.HandlerFunc {
	client := network.SafeClient()
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(code int, reason string) {
			httpx.WriteJSON(w, code, map[string]any{"success": false, "error": reason})
		}
		var body struct {
			VideoURL string `json:"videoUrl"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || body.VideoURL == "" {
			fail(400, "请选择要核查的视频")
			return
		}
		ffmpeg, ok := system.FFmpegBinary(cfg.Root)
		if !ok {
			fail(503, "当前环境缺少 FFmpeg，无法核查音视频")
			return
		}
		file, cleanup, err := resolveAudioMixMedia(r.Context(), body.VideoURL, httpx.WorkspaceFrom(r), true, client)
		defer cleanup()
		if err != nil {
			fail(400, err.Error())
			return
		}
		probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, file)
		if err != nil {
			fail(422, err.Error())
			return
		}
		picture := reviewPicture(r.Context(), ffmpeg, file)
		audio := "missing"
		if probe.HasAudio {
			peak, err := salesAudioPeak(r.Context(), ffmpeg, file)
			switch {
			case err != nil:
				audio = "unreadable"
			case peak < salesQuietPeakDB:
				audio = "quiet"
			default:
				audio = "audible"
			}
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "picture": picture, "audio": audio,
			"width": probe.Width, "height": probe.Height, "durationSec": roundTenth(probe.Duration)})
	}
}

// Decode the video stream to small luminance frames. Report a black picture only
// when every decoded frame has fewer than 2% of pixels above near-black.
func reviewPicture(ctx context.Context, ffmpeg, file string) string {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	args := append([]string{"-v", "error", "-xerror"}, audioMixInputArgs(file)...)
	args = append(args, "-map", "0:v:0", "-an", "-vf", "scale=32:32", "-vsync", "0", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1")
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	out, err := cmd.StdoutPipe()
	if err != nil || cmd.Start() != nil {
		return "unreadable"
	}
	frame := make([]byte, 32*32)
	frames, visible := 0, false
	for {
		_, err = io.ReadFull(out, frame)
		if err != nil {
			break
		}
		frames++
		if !visible {
			lit := 0
			for _, pixel := range frame {
				if pixel > 16 {
					lit++
				}
			}
			visible = lit*100 >= 2*len(frame)
		}
	}
	if cmd.Wait() != nil || err != io.EOF || frames == 0 {
		return "unreadable"
	}
	if !visible {
		return "dark"
	}
	return "visible"
}

func storeSalesVoiceResult(ctx context.Context, cfg config.Config, workspace, source string) (string, error) {
	return storeSalesVoiceWithClient(ctx, cfg, workspace, source, network.SafeClient())
}

// Archive the complete synthesized narration; voice reference limits must not trim it.
func storeSalesVoiceWithClient(ctx context.Context, cfg config.Config, workspace, source string, client audioMixMediaClient) (string, error) {
	input, cleanup, err := resolveAudioMixMedia(ctx, source, workspace, false, client)
	defer cleanup()
	if err != nil {
		return "", err
	}
	if _, err := system.ProbeAudioDuration(ctx, cfg.Root, input); err != nil {
		return "", err
	}
	if strings.HasPrefix(source, "/storage/") {
		return source, nil
	}
	raw, err := os.ReadFile(input)
	if err != nil || len(raw) == 0 {
		return "", errors.New("配音已生成，但音频读取失败")
	}
	local, _, err := generate.SaveWorkspaceBytes(workspace, "audio", "sales_voice_"+httpx.RequestID()+filepath.Ext(input), "audio/"+strings.TrimPrefix(filepath.Ext(input), "."), raw)
	if err != nil {
		return "", errors.New("配音已生成，但音频保存失败")
	}
	return local, nil
}
