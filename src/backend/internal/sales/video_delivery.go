package sales

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

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
