package system

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"os/exec"
	"strconv"
	"time"
)

// ProbeAudioDuration only inspects the first audio stream of a local media file.
func ProbeAudioDuration(ctx context.Context, root, path string) (float64, error) {
	binary, ok := binaryReady(root, "ffprobe")
	if !ok {
		return 0, errors.New("FFprobe 不可用，请检查媒体处理环境")
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	raw, err := exec.CommandContext(ctx, binary, "-v", "error", "-protocol_whitelist", "file,pipe",
		"-format_whitelist", "mov,matroska,webm,wav,mp3,aac,flac,ogg", "-select_streams", "a:0",
		"-show_entries", "stream=codec_type,duration:format=duration", "-of", "json", path).Output()
	if err != nil {
		return 0, errors.New("无法读取音频，请确认文件完整且编码受支持")
	}
	return parseAudioDuration(raw)
}

func parseAudioDuration(raw []byte) (float64, error) {
	var parsed struct {
		Streams []struct {
			CodecType string `json:"codec_type"`
			Duration  string `json:"duration"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		return 0, errors.New("无法读取音频信息")
	}
	if len(parsed.Streams) == 0 || parsed.Streams[0].CodecType != "audio" {
		return 0, errors.New("素材没有可保存的音轨")
	}
	duration, _ := strconv.ParseFloat(parsed.Streams[0].Duration, 64)
	if duration <= 0 {
		duration, _ = strconv.ParseFloat(parsed.Format.Duration, 64)
	}
	if duration <= 0 || math.IsNaN(duration) || math.IsInf(duration, 0) {
		return 0, errors.New("无法读取音频时长")
	}
	return duration, nil
}
