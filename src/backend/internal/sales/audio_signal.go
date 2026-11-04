package sales

import (
	"context"
	"errors"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Check the actual audio track before mixing in music, which can mask an empty
// narration. This detects digital silence; audibility alone cannot establish speech.
func checkSalesAudioSignal(ctx context.Context, ffmpeg, file string) error {
	level, err := salesAudioPeak(ctx, ffmpeg, file)
	if err != nil {
		return err
	}
	if level < salesQuietPeakDB {
		return errors.New("口播或旁白音轨为静音或接近静音，请核对原音频")
	}
	return nil
}

const salesQuietPeakDB = -75

func salesAudioPeak(ctx context.Context, ffmpeg, file string) (float64, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	args := append([]string{"-hide_banner", "-nostats"}, audioMixInputArgs(file)...)
	args = append(args, "-map", "0:a:0", "-vn", "-af", "volumedetect", "-f", "null", "-")
	output, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput()
	if err != nil {
		return 0, errors.New("无法解码并检测音轨")
	}
	_, value, ok := strings.Cut(string(output), "max_volume:")
	fields := strings.Fields(value)
	if !ok || len(fields) < 2 {
		return 0, errors.New("未能测量音轨音量")
	}
	level, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return 0, errors.New("未能测量音轨峰值")
	}
	return level, nil
}
