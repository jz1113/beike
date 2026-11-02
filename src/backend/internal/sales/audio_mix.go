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
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
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
		probe, err := system.ProbeVideo(cfg.Root, videoFile)
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

		hasSpeech := voiceFile != "" || keepOrig
		bgmVol, _ := audioMixBgmVolume(body.BgmVolume, hasSpeech)

		dur := math.Max(0.5, probe.Duration)
		fadeStart := math.Max(0, dur-0.6)
		fadeDur := math.Min(0.6, dur)

		rel := storage.WorkspaceKey(fmt.Sprintf("azhuo/generated/videos/%s/sales_mix_%s.mp4", time.Now().Format("200601"), httpx.RequestID()), workspace)
		output := storage.SafeWithin(storage.ResolveRoot(), rel)
		if output == "" || os.MkdirAll(filepath.Dir(output), 0o755) != nil {
			fail(500, "创建成片输出目录失败")
			return
		}

		args := buildAudioMixFFmpegArgs(videoFile, voiceFile, bgmFile, keepOrig, bgmVol, dur, fadeStart, fadeDur, output)
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

		httpx.WriteJSON(w, 200, map[string]any{
			"success":     true,
			"videoUrl":    "/storage/" + rel,
			"durationSec": roundTenth(dur),
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

func buildAudioMixFFmpegArgs(videoFile, voiceFile, bgmFile string, keepOrig bool, bgmVol, dur, fadeStart, fadeDur float64, output string) []string {
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
	if ext := strings.ToLower(filepath.Ext(videoFile)); ext == ".webm" || ext == ".mov" {
		videoCodec = []string{"-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"}
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
