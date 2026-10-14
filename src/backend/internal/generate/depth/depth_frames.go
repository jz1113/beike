package depth

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/system"
)

func extractDepthFrames(root, input, outDir string, maxWidth int) (int, float64, error) {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return 0, 0, errors.New("FFmpeg 不可用")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return 0, 0, err
	}
	probe, err := system.ProbeVideo(root, input)
	if err != nil {
		return 0, 0, err
	}
	if maxWidth <= 0 {
		maxWidth = 1280
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	args := []string{"-y", "-i", input, "-t", "30", "-vf", "scale='min(" + strconv.Itoa(maxWidth) + ",iw)':-2", "-vsync", "0", filepath.Join(outDir, "%06d.png")}
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	if err := cmd.Run(); err != nil {
		return 0, 0, errors.New("抽帧失败：未生成任何帧")
	}
	count := countPNG(outDir)
	if count == 0 {
		return 0, 0, errors.New("抽帧失败：未生成任何帧")
	}
	fps := probe.FPS
	if fps <= 0 {
		fps = 24
	}
	return count, fps, nil
}

func encodeDepthFrames(root, framesDir, output string, fps float64, crf int, preset string) error {
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return errors.New("FFmpeg 不可用")
	}
	if countPNG(framesDir) == 0 {
		return errors.New("编码失败：深度帧目录为空")
	}
	if err := os.MkdirAll(filepath.Dir(output), 0o755); err != nil {
		return err
	}
	if fps < 1 {
		fps = 1
	}
	if preset == "" {
		preset = "medium"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg,
		"-y", "-framerate", strconv.FormatFloat(fps, 'f', -1, 64), "-i", filepath.Join(framesDir, "%06d.png"),
		"-c:v", "libx264", "-crf", strconv.Itoa(crf), "-preset", preset, "-pix_fmt", "yuv420p", "-movflags", "+faststart", output)
	if err := cmd.Run(); err != nil {
		return errors.New("深度视频编码失败")
	}
	return nil
}

func countPNG(dir string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".png") {
			count++
		}
	}
	return count
}
