package sales

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/media"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

var allowedAudioExts = map[string]bool{
	".mp3": true, ".wav": true, ".m4a": true, ".aac": true, ".ogg": true, ".flac": true, ".opus": true,
}

type audioMixRequest struct {
	VideoURL          string   `json:"videoUrl"`
	VoiceMode         string   `json:"voiceMode"`
	VoiceoverURL      string   `json:"voiceoverUrl"`
	BgmID             string   `json:"bgmId"`
	BgmURL            string   `json:"bgmUrl"`
	BgmVolume         *float64 `json:"bgmVolume"`
	KeepOriginalAudio *bool    `json:"keepOriginalAudio"`
}

func localWorkspaceAudioFile(source, workspace string) (string, error) {
	path := strings.SplitN(strings.SplitN(strings.TrimSpace(source), "?", 2)[0], "#", 2)[0]
	if !strings.HasPrefix(path, "/storage/") {
		return "", errors.New("只接受当前工作区存储中的音频文件")
	}
	rel := strings.TrimPrefix(path, "/storage/")
	if !storage.WorkspaceRel(rel, workspace, true) {
		return "", errors.New("音频文件不属于当前工作区")
	}
	file := storage.StoredFile(rel)
	if file == "" {
		return "", errors.New("音频文件不存在或已失效，请重新生成或上传")
	}
	if !allowedAudioExts[strings.ToLower(filepath.Ext(file))] {
		return "", errors.New("音频仅支持 MP3、WAV、M4A、AAC、OGG、FLAC 或 OPUS")
	}
	return file, nil
}

// AudioMix muxes generated or uploaded video with voiceover and a selected BGM.
func AudioMix(cfg config.Config) http.HandlerFunc {
	return audioMixHandler(cfg, network.SafeClient())
}

func audioMixHandler(cfg config.Config, client audioMixMediaClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(status int, message string) {
			httpx.WriteJSON(w, status, map[string]any{"success": false, "error": message})
		}
		var body audioMixRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
			fail(400, "音视频合成请求格式错误")
			return
		}
		if _, err := audioMixBgmVolume(body.BgmVolume, false); err != nil {
			fail(400, err.Error())
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		videoFile, cleanupVideo, err := resolveAudioMixMedia(r.Context(), body.VideoURL, workspace, true, client)
		defer cleanupVideo()
		if err != nil {
			fail(400, err.Error())
			return
		}
		probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, videoFile)
		if err != nil || probe.Duration <= 0 {
			fail(400, "无法读取待合成视频的时长规格")
			return
		}
		ffmpeg, ok := system.FFmpegBinary(cfg.Root)
		if !ok {
			fail(503, "当前环境未就绪 FFmpeg，暂无法执行成片混音")
			return
		}

		voiceFile := ""
		if strings.TrimSpace(body.VoiceoverURL) != "" {
			var cleanupVoice func()
			voiceFile, cleanupVoice, err = resolveAudioMixMedia(r.Context(), body.VoiceoverURL, workspace, false, client)
			defer cleanupVoice()
			if err != nil {
				fail(400, "旁白音频无效："+err.Error())
				return
			}
		}

		if voiceFile != "" {
			duration, err := system.ProbeAudioDuration(r.Context(), cfg.Root, voiceFile)
			if err != nil {
				fail(422, err.Error())
				return
			}
			window := probe.Duration
			if probe.VideoDuration > 0 {
				window = probe.VideoDuration
			}
			if duration > window+0.05 {
				fail(422, fmt.Sprintf("旁白实测 %.2f 秒，画面 %.2f 秒；请缩短超时台词或延长镜头后重试，原片与配音已保留", duration, window))
				return
			}
		} else if body.VoiceMode == "voiceover" || (body.VoiceMode == "speech" && !probe.HasAudio) {
			fail(422, "缺少本次旁白或原片口播音轨，请核对声音后合成")
			return
		}
		bgmFile := ""
		cleanupBgm := func() {}
		defer func() { cleanupBgm() }()

		if strings.TrimSpace(body.BgmURL) != "" {
			bgmFile, cleanupBgm, err = resolveAudioMixMedia(r.Context(), body.BgmURL, workspace, false, client)
			if err != nil {
				fail(400, "BGM 音频无效："+err.Error())
				return
			}
		} else if strings.TrimSpace(body.BgmID) != "" {
			bgmFile, cleanupBgm, err = resolveStudioMixBgm(r.Context(), cfg, workspace, strings.TrimSpace(body.BgmID), client)
			if err != nil {
				fail(400, err.Error())
				return
			}
		}

		if voiceFile == "" && bgmFile == "" {
			fail(400, "请至少提供旁白配音或选择一首背景音乐")
			return
		}

		keepOrig := body.VoiceMode == "speech" && probe.HasAudio && voiceFile == ""
		if body.KeepOriginalAudio != nil {
			keepOrig = *body.KeepOriginalAudio && probe.HasAudio && voiceFile == ""
		}

		if voiceFile != "" || body.VoiceMode == "speech" && keepOrig {
			track := voiceFile
			if track == "" {
				track = videoFile
			}
			if err := checkSalesAudioSignal(r.Context(), ffmpeg, track); err != nil {
				fail(422, err.Error())
				return
			}
		}
		hasSpeech := voiceFile != "" || keepOrig
		bgmVol, _ := audioMixBgmVolume(body.BgmVolume, hasSpeech)

		dur := probe.Duration
		if probe.VideoDuration > 0 {
			dur = probe.VideoDuration
		}
		fadeStart := math.Max(0, dur-0.6)
		fadeDur := math.Min(0.6, dur)

		rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/generated/videos/%s/sales_mix_%s.mp4", time.Now().Format("200601"), httpx.RequestID()), workspace)
		output := storage.SafeWithin(storage.ResolveRoot(), rel)
		if output == "" || os.MkdirAll(filepath.Dir(output), 0o755) != nil {
			fail(500, "创建成片输出目录失败")
			return
		}

		args := buildAudioMixFFmpegArgs(videoFile, voiceFile, bgmFile, probe.Codec == "h264" && probe.PixelFormat == "yuv420p", keepOrig, bgmVol, dur, fadeStart, fadeDur, output)
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, ffmpeg, args...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if runErr := cmd.Run(); runErr != nil {
			_ = os.Remove(output)
			fail(500, "FFmpeg 音视频混音合成失败，请检查音视频编码格式")
			return
		}

		delivered, err := system.ProbeLocalVideo(r.Context(), cfg.Root, output)
		if err != nil || !delivered.HasAudio || delivered.Width <= 0 || delivered.Height <= 0 || math.Abs(delivered.Duration-dur) > 0.15 {
			_ = os.Remove(output)
			fail(500, "成片音视频轨道或时长校验失败，可重试合成")
			return
		}
		httpx.WriteJSON(w, 200, map[string]any{
			"success":     true,
			"videoUrl":    "/storage/" + rel,
			"durationSec": roundTenth(delivered.Duration),
			"duckedBgm":   hasSpeech && bgmFile != "",
		})
	}
}

func audioMixBgmVolume(volume *float64, hasSpeech bool) (float64, error) {
	if volume != nil {
		if math.IsNaN(*volume) || math.IsInf(*volume, 0) || *volume < 0 || *volume > 1.2 {
			return 0, errors.New("BGM 音量需在 0—1.2 之间")
		}
		return *volume, nil
	}
	if hasSpeech {
		return 0.16, nil
	}
	return 0.38, nil
}

func buildAudioMixFFmpegArgs(videoFile, voiceFile, bgmFile string, compatibleVideo, keepOrig bool, bgmVol, dur, fadeStart, fadeDur float64, output string) []string {
	args := append([]string{"-y"}, audioMixInputArgs(videoFile)...)
	var filter string
	// The bundled Linux FFmpeg predates apad's whole_dur and amix's normalize.
	// Trim unbounded silence padding to the video duration; undo amix's default
	// averaging so the two equally long inputs retain their requested gains.

	switch {
	case voiceFile != "" && bgmFile != "":
		args = append(args, audioMixInputArgs(voiceFile)...)
		args = append(args, "-stream_loop", "-1")
		args = append(args, audioMixInputArgs(bgmFile)...)
		filter = fmt.Sprintf(
			"[1:a]volume=1.0,apad,atrim=0:%.2f,asetpts=PTS-STARTPTS[vo];[2:a]atrim=0:%.2f,asetpts=PTS-STARTPTS,volume=%.2f,afade=t=out:st=%.2f:d=%.2f[bgm];[vo][bgm]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]",
			dur, dur, bgmVol, fadeStart, fadeDur,
		)
	case voiceFile != "":
		args = append(args, audioMixInputArgs(voiceFile)...)
		filter = fmt.Sprintf("[1:a]volume=1.0,apad,atrim=0:%.2f,asetpts=PTS-STARTPTS[aout]", dur)
	case keepOrig && bgmFile != "":
		args = append(args, "-stream_loop", "-1")
		args = append(args, audioMixInputArgs(bgmFile)...)
		filter = fmt.Sprintf(
			"[0:a]volume=1.0,apad,atrim=0:%.2f,asetpts=PTS-STARTPTS[orig];[1:a]atrim=0:%.2f,asetpts=PTS-STARTPTS,volume=%.2f,afade=t=out:st=%.2f:d=%.2f[bgm];[orig][bgm]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]",
			dur, dur, bgmVol, fadeStart, fadeDur,
		)
	default:
		args = append(args, "-stream_loop", "-1")
		args = append(args, audioMixInputArgs(bgmFile)...)
		filter = fmt.Sprintf("[1:a]atrim=0:%.2f,asetpts=PTS-STARTPTS,volume=%.2f,afade=t=out:st=%.2f:d=%.2f[aout]", dur, bgmVol, fadeStart, fadeDur)
	}

	// WebM commonly uses VP8, which cannot be copied into MP4; MOV may use ProRes.
	videoCodec := []string{"-c:v", "copy"}
	if !compatibleVideo {
		videoCodec = []string{"-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"}
	}
	args = append(args, videoCodec...)
	args = append(args,
		"-filter_complex", filter,
		"-map", "0:v:0",
		"-map", "[aout]",
		"-c:a", "aac",
		"-b:a", "160k",
		"-movflags", "+faststart",
		output,
	)
	return args
}

// Keep each demuxer from resolving nested remote streams or playlist protocols.
func audioMixInputArgs(file string) []string {
	return []string{"-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm,wav,mp3,aac,flac,ogg", "-i", file}
}

const audioMixVideoLimit int64 = 128 << 20
const audioMixAudioLimit int64 = 32 << 20

type audioMixMediaClient interface {
	Do(*http.Request) (*http.Response, error)
}

// Object-store uploads and generated clips can return signed HTTPS URLs. Download
// those through the public-network client; FFmpeg only ever receives local files.
func resolveAudioMixMedia(ctx context.Context, source, workspace string, video bool, client audioMixMediaClient) (string, func(), error) {
	cleanup := func() {}
	source = strings.TrimSpace(source)
	if strings.HasPrefix(source, "/storage/") {
		var file string
		var err error
		if video {
			file, err = localScriptVideoFile(source, workspace)
		} else {
			file, err = localWorkspaceAudioFile(source, workspace)
		}
		return file, cleanup, err
	}
	parsed, err := url.Parse(source)
	if err != nil || len(source) > 8192 || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" || parsed.User != nil {
		return "", cleanup, errors.New("仅支持当前工作区文件或公网 HTTP 音视频地址")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return "", cleanup, errors.New("音视频地址无效")
	}
	accept, limit := "audio/*", audioMixAudioLimit
	if video {
		accept, limit = "video/*", audioMixVideoLimit
	}
	for key, value := range media.RemoteMediaHeaders(source, accept) {
		req.Header.Set(key, value)
	}
	response, err := client.Do(req)
	if err != nil {
		return "", cleanup, errors.New("远程音视频读取失败，请确认地址可访问后重试")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", cleanup, errors.New("远程音视频已失效或不可访问，请重新生成或上传")
	}
	sizeError := func() error {
		return fmt.Errorf("待合成媒体超过 %d MB，请压缩或截取后重试", limit>>20)
	}
	if response.ContentLength > limit {
		return "", cleanup, sizeError()
	}
	// Inspect bytes, not the filename or content-type: reject playlists/HTML before
	// a media parser can follow an embedded URL or interpret another local path.
	header := make([]byte, 16)
	n, readErr := io.ReadFull(response.Body, header)
	if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
		return "", cleanup, errors.New("远程音视频下载中断，请重试")
	}
	header = header[:n]
	extension := audioMixMediaExtension(header, video)
	if extension == "" {
		return "", cleanup, errors.New("远程地址未返回支持的音视频文件，请重新上传 MP4/MOV/WebM 视频或常见音频文件")
	}
	file, err := os.CreateTemp("", "sales-mix-input-*"+extension)
	if err != nil {
		return "", cleanup, errors.New("准备合成临时文件失败")
	}
	cleanup = func() { _ = os.Remove(file.Name()) }
	if _, err := file.Write(header); err != nil {
		_ = file.Close()
		cleanup()
		return "", func() {}, errors.New("写入合成临时文件失败")
	}
	written, copyErr := io.Copy(file, io.LimitReader(response.Body, limit-int64(n)+1))
	closeErr := file.Close()
	if int64(n)+written > limit {
		cleanup()
		return "", func() {}, sizeError()
	}
	if copyErr != nil || closeErr != nil || ctx.Err() != nil {
		cleanup()
		return "", func() {}, errors.New("远程音视频下载中断，请重试")
	}
	return file.Name(), cleanup, nil
}

func audioMixMediaExtension(header []byte, video bool) string {
	if len(header) < 12 {
		return ""
	}
	if string(header[4:8]) == "ftyp" || (video && (string(header[4:8]) == "moov" || string(header[4:8]) == "mdat")) {
		if string(header[8:12]) == "qt  " || string(header[4:8]) != "ftyp" {
			return ".mov"
		}
		return ".mp4"
	}
	if video {
		if string(header[:4]) == "\x1a\x45\xdf\xa3" {
			return ".webm"
		}
		return ""
	}
	switch string(header[:4]) {
	case "RIFF":
		if string(header[8:12]) == "WAVE" {
			return ".wav"
		}
	case "fLaC":
		return ".flac"
	case "OggS":
		return ".ogg"
	}
	if string(header[:3]) == "ID3" || (header[0] == 0xff && header[1]&0xe0 == 0xe0) {
		return ".mp3"
	}
	return ""
}

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
