package system

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type VideoProbe struct {
	Duration float64
	FPS      float64
	Width    int
	Height   int
	HasAudio bool
}

func ProbeVideo(root, path string) (VideoProbe, error) {
	binary, ok := binaryReady(root, "ffprobe")
	if !ok {
		return VideoProbe{}, errors.New("ffprobe 不可用")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", path)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return VideoProbe{}, errors.New("未在视频中找到视频流")
	}
	return parseProbe(stdout.Bytes())
}

func parseProbe(raw []byte) (VideoProbe, error) {
	var parsed struct {
		Streams []struct {
			CodecType    string `json:"codec_type"`
			Width        int    `json:"width"`
			Height       int    `json:"height"`
			RFrameRate   string `json:"r_frame_rate"`
			AvgFrameRate string `json:"avg_frame_rate"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		return VideoProbe{}, errors.New("未在视频中找到视频流")
	}
	duration, _ := strconv.ParseFloat(strings.TrimSpace(parsed.Format.Duration), 64)
	width, height := 0, 0
	avgRate, frameRate := "", ""
	foundVideo := false
	hasAudio := false
	for _, stream := range parsed.Streams {
		if stream.CodecType == "audio" {
			hasAudio = true
			continue
		}
		if stream.CodecType != "video" || foundVideo {
			continue
		}
		foundVideo = true
		width, height = stream.Width, stream.Height
		avgRate, frameRate = stream.AvgFrameRate, stream.RFrameRate
	}
	if !foundVideo {
		return VideoProbe{}, errors.New("未在视频中找到视频流")
	}
	fps := parseFrameRate(avgRate)
	if fps <= 0 {
		fps = parseFrameRate(frameRate)
	}
	if fps <= 0 {
		fps = 24
	}
	return VideoProbe{Duration: duration, FPS: fps, Width: width, Height: height, HasAudio: hasAudio}, nil
}

func parseFrameRate(value string) float64 {
	parts := strings.Split(value, "/")
	if len(parts) == 2 {
		num, errN := strconv.ParseFloat(parts[0], 64)
		den, errD := strconv.ParseFloat(parts[1], 64)
		if errN == nil && errD == nil && den != 0 {
			return num / den
		}
		return 0
	}
	rate, _ := strconv.ParseFloat(value, 64)
	return rate
}
