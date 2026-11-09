package system

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type VideoProbe struct {
	Duration      float64
	VideoDuration float64
	Codec         string
	PixelFormat   string
	FPS           float64
	Width         int
	Height        int
	HasAudio      bool
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
			Codec        string `json:"codec_name"`
			PixelFormat  string `json:"pix_fmt"`
			Duration     string `json:"duration"`
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
	var videoDuration float64
	var codec, pixel string
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
		videoDuration, _ = strconv.ParseFloat(stream.Duration, 64)
		codec, pixel = stream.Codec, stream.PixelFormat
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
	return VideoProbe{Duration: duration, VideoDuration: videoDuration, Codec: codec, PixelFormat: pixel, FPS: fps, Width: width, Height: height, HasAudio: hasAudio}, nil
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

func binaryReady(root, name string) (string, bool) {
	candidates := []string{}
	if bundled := bundledBinary(root, name); bundled != "" {
		candidates = append(candidates, bundled)
	}
	if system, err := exec.LookPath(name); err == nil {
		candidates = append(candidates, system)
	}
	for _, candidate := range candidates {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cmd := exec.CommandContext(ctx, candidate, "-version")
		cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
		err := cmd.Run()
		cancel()
		if err == nil {
			return candidate, true
		}
	}
	return name, false
}

func bundledBinary(root, name string) string {
	return bundledBinaryForPlatform(root, name, runtime.GOOS, runtime.GOARCH)
}

// Resolve the installer's real package directory before locating its platform
// dependency. pnpm keeps that dependency beside the package in its virtual store.
func bundledBinaryForPlatform(root, name, goos, goarch string) string {
	if name != "ffmpeg" && name != "ffprobe" {
		return ""
	}
	platform, arch, executable := goos, goarch, name
	if goos == "windows" {
		platform, executable = "win32", name+".exe"
	}
	switch goarch {
	case "amd64":
		arch = "x64"
	case "386":
		arch = "ia32"
	}
	scope := "@" + name + "-installer"
	packageDir := filepath.Join(root, "node_modules", scope, name)
	if resolved, err := filepath.EvalSymlinks(packageDir); err == nil {
		candidate := filepath.Join(filepath.Dir(resolved), platform+"-"+arch, executable)
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
			return candidate
		}
	}
	// Also accept flat installations with a platform package at the root.
	candidate := filepath.Join(root, "node_modules", scope, platform+"-"+arch, executable)
	if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
		return candidate
	}
	return ""
}

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

// ProbeLocalVideo never resolves nested playlists, remote streams or protocols.
// Callers must still validate that path belongs to the authorized workspace.
func ProbeLocalVideo(ctx context.Context, root, path string) (VideoProbe, error) {
	binary, ok := binaryReady(root, "ffprobe")
	if !ok {
		return VideoProbe{}, errors.New("ffprobe 不可用")
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "-v", "quiet", "-protocol_whitelist", "file,pipe",
		"-format_whitelist", "mov,matroska,webm", "-print_format", "json", "-show_streams", "-show_format", path)
	raw, err := cmd.Output()
	if err != nil {
		return VideoProbe{}, errors.New("无法读取本地视频流")
	}
	return parseProbe(raw)
}
