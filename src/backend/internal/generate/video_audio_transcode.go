package generate

import (
	"context"
	"math"
	"os"
	"os/exec"
	"strconv"
	"time"

	"beike.local/cloud/src/backend/internal/system"
)

// Existing local voice-library formats are converted only for provider input.
// Source bytes remain untouched; duration limits are supplied by preparation.
func prepareLocalReferenceAudio(ctx context.Context, root, path string) ([]byte, string, string, error) {
	body, ext, mime, err := readLocalReferenceAudio(path)
	if err != nil || ext == "mp3" || ext == "wav" {
		return body, ext, mime, err
	}
	return transcodeReferenceAudio(ctx, root, path, "wav", 0)
}

// A positive maximum keeps the beginning of the sample without changing speed.
// Only fixed output formats are accepted; source media is never overwritten.
func transcodeReferenceAudio(ctx context.Context, root, path, format string, maxSeconds float64) ([]byte, string, string, error) {
	if format != "mp3" && format != "wav" {
		return nil, "", "", imageEditPrepareError{"参考音频转换仅支持 MP3 或 WAV 格式"}
	}
	if math.IsNaN(maxSeconds) || math.IsInf(maxSeconds, 0) {
		return nil, "", "", imageEditPrepareError{"参考音频时长限制不正确"}
	}
	body, ext, mime, err := readLocalReferenceAudio(path)
	if err != nil || ext == format && maxSeconds <= 0 {
		return body, ext, mime, err
	}
	limit := maxSeconds
	if limit > 0 && format == "mp3" {
		// MP3 frame padding is counted by ffprobe and provider duration checks.
		limit -= 0.1
		if limit <= 0 {
			return nil, "", "", imageEditPrepareError{"参考音频可用时长不足，无法准备 MP3 样本"}
		}
	}
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		return nil, "", "", imageEditPrepareError{"当前环境未就绪 FFmpeg，无法转换已有音色样本，请检查媒体处理环境"}
	}
	file, err := os.CreateTemp("", "video-reference-audio-*."+format)
	if err != nil {
		return nil, "", "", imageEditPrepareError{"无法准备参考音频转换文件"}
	}
	defer os.Remove(file.Name())
	if err := file.Close(); err != nil {
		return nil, "", "", imageEditPrepareError{"无法准备参考音频转换文件"}
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	args := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,wav,mp3,aac,flac,ogg",
		"-i", path, "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1"}
	if limit > 0 {
		args = append(args, "-t", strconv.FormatFloat(math.Floor(limit*1e6)/1e6, 'f', 6, 64))
	}
	if format == "mp3" {
		args = append(args, "-c:a", "libmp3lame", "-q:a", "2")
	} else {
		args = append(args, "-c:a", "pcm_s16le")
	}
	args = append(args, "-ac", "1", "-ar", "32000", "-f", format, file.Name())
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	if err := cmd.Run(); err != nil {
		return nil, "", "", imageEditPrepareError{"参考音频转换失败，请确认样本完整且编码受支持"}
	}
	return readLocalReferenceAudio(file.Name())
}
