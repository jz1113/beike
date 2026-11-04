package sales

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

const studioVoiceSampleMaxSeconds = 15.0

// Importing a voice prepares the same sample for both playback and generation.
// discard removes only a newly created clip if its database mutation fails.
func prepareStudioVoiceSample(ctx context.Context, cfg config.Config, workspace, source string, client audioMixMediaClient) (string, func(), error) {
	source = strings.TrimSpace(source)
	noop := func() {}
	if source == "" {
		return "", noop, nil
	}
	input, cleanup, err := resolveAudioMixMedia(ctx, source, workspace, false, client)
	defer cleanup()
	if err != nil {
		return "", noop, err
	}
	info, err := os.Stat(input)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return "", noop, errors.New("人声音频不存在或为空，请重新上传")
	}
	if info.Size() > audioMixAudioLimit {
		return "", noop, errors.New("人声音频不能超过 32 MiB，请压缩后重新上传")
	}
	file, err := os.Open(input)
	if err != nil {
		return "", noop, errors.New("无法读取人声音频，请重新上传")
	}
	header := make([]byte, 16)
	n, _ := io.ReadFull(file, header)
	_ = file.Close()
	if audioMixMediaExtension(header[:n], false) == "" {
		return "", noop, errors.New("人声音频格式无效，请上传完整的 MP3、WAV、M4A、AAC、OGG、FLAC 或 OPUS 音频")
	}
	duration, err := system.ProbeAudioDuration(ctx, cfg.Root, input)
	if err != nil {
		return "", noop, err
	}
	if duration <= studioVoiceSampleMaxSeconds {
		return source, noop, nil
	}
	output, audioURL, err := renderStudioVoiceSample(ctx, cfg.Root, workspace, input)
	if err != nil {
		return "", noop, err
	}
	return audioURL, func() { _ = os.Remove(output) }, nil
}

func renderStudioVoiceSample(ctx context.Context, root, workspace, input string) (output, audioURL string, err error) {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return "", "", errors.New("FFmpeg 不可用，暂时无法自动裁切人声，请检查媒体处理环境")
	}
	rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/generated/audio/%s/sales_voice_%s.wav", time.Now().Format("200601"), httpx.RequestID()), workspace)
	output = storage.SafeWithin(storage.ResolveRoot(), rel)
	if output == "" || os.MkdirAll(filepath.Dir(output), 0o755) != nil {
		return "", "", errors.New("创建人声音频保存目录失败")
	}
	defer func() {
		if err != nil {
			_ = os.Remove(output)
		}
	}()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	args := append([]string{"-n", "-nostdin", "-hide_banner", "-loglevel", "error"}, audioMixInputArgs(input)...)
	// PCM avoids encoder padding that could push a 15-second MP3/AAC crop over
	// the provider limit. No padding, speed changes or source overwrite occurs.
	args = append(args, "-t", "15", "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1",
		"-c:a", "pcm_s16le", "-ac", "1", "-ar", "32000", "-f", "wav", output)
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	if cmd.Run() != nil {
		return output, "", errors.New("人声音频自动裁切失败，请确认音频完整后重试")
	}
	measured, err := system.ProbeAudioDuration(ctx, root, output)
	if err != nil || math.Abs(measured-studioVoiceSampleMaxSeconds) > 0.001 || measured > studioVoiceSampleMaxSeconds {
		return output, "", errors.New("裁切后的人声时长核对失败，请重新上传")
	}
	return output, "/storage/" + rel, nil
}
