package videosales

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

// ComposeClip describes one video or image segment in the timeline
type ComposeClip struct {
	Type       string  `json:"type"` // "video" | "image"
	FilePath   string  `json:"filePath"`
	Duration   float64 `json:"duration"`
	Transition string  `json:"transition"`       // "direct_concat" | "ffmpeg_fade" | "ai_start_end"
	Motion     string  `json:"motion,omitempty"` // "zoom_in_slow", "pan_left", "ken_burns", etc.
	HasAudio   bool    `json:"hasAudio,omitempty"`
	Voiceover  string  `json:"voiceover,omitempty"`
	AudioURL   string  `json:"audioUrl,omitempty"`
}

// ComposeSubtitle describes timed subtitle line
type ComposeSubtitle struct {
	Text      string  `json:"text"`
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
}

// ComposeOutputSpec describes output resolution, ratio, and audio
type ComposeOutputSpec struct {
	Resolution  string  `json:"resolution"`  // "720p" | "1080p"
	AspectRatio string  `json:"aspectRatio"` // "9:16" | "16:9" | "3:4" | "1:1"
	BgmPath     string  `json:"bgmPath,omitempty"`
	BgmVolume   float64 `json:"bgmVolume"` // 0.0 - 1.0 (default 0.3)
}

// ComposePayload is the incoming request body
type ComposePayload struct {
	ProjectID string            `json:"projectId"`
	Clips     []ComposeClip     `json:"clips"`
	Output    ComposeOutputSpec `json:"output"`
	Subtitles []ComposeSubtitle `json:"subtitles,omitempty"`
}

// BuildFFmpegCommand generates the full ffmpeg command line and complex filter
func BuildFFmpegCommand(p ComposePayload, outputPath string) (string, []string) {
	width := 1080
	height := 1920

	switch p.Output.AspectRatio {
	case "16:9":
		if p.Output.Resolution == "720p" {
			width, height = 1280, 720
		} else {
			width, height = 1920, 1080
		}
	case "3:4":
		if p.Output.Resolution == "720p" {
			width, height = 720, 960
		} else {
			width, height = 1080, 1440
		}
	case "1:1":
		if p.Output.Resolution == "720p" {
			width, height = 720, 720
		} else {
			width, height = 1080, 1080
		}
	default: // "9:16"
		if p.Output.Resolution == "720p" {
			width, height = 720, 1280
		} else {
			width, height = 1080, 1920
		}
	}

	var args []string
	args = append(args, "-y")

	var filterParts []string
	fps := 30

	hasAnyAudio := false
	for _, c := range p.Clips {
		if (c.HasAudio && c.Type == "video") || strings.TrimSpace(c.AudioURL) != "" {
			hasAnyAudio = true
			break
		}
	}

	// 1. Inputs & scaling
	for i, clip := range p.Clips {
		d := clip.Duration
		if d <= 0 {
			d = 3
		}
		frames := int(d * float64(fps))
		if frames < 1 {
			frames = 30
		}

		if clip.Type == "image" && clip.Motion != "" && clip.Motion != "static" {
			args = append(args, "-loop", "1", "-t", fmt.Sprintf("%.2f", d), "-i", clip.FilePath)
			var zoomFilter string
			switch clip.Motion {
			case "zoom_out_slow":
				zoomFilter = fmt.Sprintf("zoompan=z='if(eq(on,1),1.5,max(zoom-0.002,1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d", frames, width, height, fps)
			case "pan_left":
				zoomFilter = fmt.Sprintf("zoompan=z='1.3':x='iw/2-(iw/zoom/2)+on*(iw/zoom/%d*0.3)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d", frames, frames, width, height, fps)
			case "pan_right":
				zoomFilter = fmt.Sprintf("zoompan=z='1.3':x='iw/2-(iw/zoom/2)-on*(iw/zoom/%d*0.3)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d", frames, frames, width, height, fps)
			case "ken_burns":
				zoomFilter = fmt.Sprintf("zoompan=z='min(zoom+0.001,1.3)':x='iw/2-(iw/zoom/2)+on*0.5':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d", frames, width, height, fps)
			default: // "zoom_in_slow"
				zoomFilter = fmt.Sprintf("zoompan=z='min(zoom+0.002,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d", frames, width, height, fps)
			}
			filterParts = append(filterParts, fmt.Sprintf("[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,%s,setpts=PTS-STARTPTS[v%d]", i, width, height, width, height, zoomFilter, i))
		} else {
			if clip.Type == "image" {
				args = append(args, "-loop", "1", "-t", fmt.Sprintf("%.2f", d), "-i", clip.FilePath)
			} else {
				args = append(args, "-t", fmt.Sprintf("%.2f", d), "-i", clip.FilePath)
			}
			filterParts = append(filterParts, fmt.Sprintf("[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d,setpts=PTS-STARTPTS[v%d]", i, width, height, width, height, fps, i))
		}
	}

	// 2. Video concatenation. Fade offset is the running timeline, not only the previous clip.
	currentVideoStream := "v0"
	timeline := clipSeconds(p.Clips[0])
	for i := 1; i < len(p.Clips); i++ {
		nextStream := fmt.Sprintf("xfade%d", i)
		clipDur := clipSeconds(p.Clips[i])
		if p.Clips[i].Transition == "ffmpeg_fade" {
			const fadeDuration = 0.5
			offset := timeline - fadeDuration
			if offset < 0 {
				offset = 0
			}
			filterParts = append(filterParts, fmt.Sprintf("[%s][v%d]xfade=transition=fade:duration=%.2f:offset=%.2f[%s]", currentVideoStream, i, fadeDuration, offset, nextStream))
			timeline += clipDur - fadeDuration
		} else {
			filterParts = append(filterParts, fmt.Sprintf("[%s][v%d]concat=n=2:v=1:a=0[%s]", currentVideoStream, i, nextStream))
			timeline += clipDur
		}
		currentVideoStream = nextStream
	}

	// 3. Audio track processing. Voiceover files are extra inputs after the picture tracks.
	voiceInput := map[int]int{}
	nextInput := len(p.Clips)
	for i, clip := range p.Clips {
		if strings.TrimSpace(clip.AudioURL) == "" {
			continue
		}
		args = append(args, "-i", clip.AudioURL)
		voiceInput[i] = nextInput
		nextInput++
	}
	var audioParts []string
	if hasAnyAudio {
		for i, clip := range p.Clips {
			d := clip.Duration
			if d <= 0 {
				d = 3
			}
			if input, ok := voiceInput[i]; ok {
				audioParts = append(audioParts, fmt.Sprintf("[%d:a]atrim=duration=%.2f,apad=whole_dur=%.2f,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a%d]", input, d, d, i))
			} else if clip.HasAudio && clip.Type == "video" {
				audioParts = append(audioParts, fmt.Sprintf("[%d:a]atrim=duration=%.2f,apad=whole_dur=%.2f,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a%d]", i, d, d, i))
			} else {
				audioParts = append(audioParts, fmt.Sprintf("anullsrc=r=44100:cl=stereo,atrim=duration=%.2f,asetpts=PTS-STARTPTS[a%d]", d, i))
			}
		}
	}

	currentAudioStream := ""
	if hasAnyAudio && len(audioParts) > 0 {
		filterParts = append(filterParts, audioParts...)
		joined, joinFilters := audioJoinFilters(p.Clips)
		filterParts = append(filterParts, joinFilters...)
		currentAudioStream = joined
	}

	// 4. BGM mixing
	if p.Output.BgmPath != "" {
		bgmIdx := nextInput
		args = append(args, "-i", p.Output.BgmPath)
		vol := p.Output.BgmVolume
		if vol <= 0 || vol > 1 {
			vol = 0.3
		}
		if currentAudioStream != "" {
			filterParts = append(filterParts, fmt.Sprintf("[%s]asplit=2[voice_mix][voice_sc]", currentAudioStream))
			filterParts = append(filterParts, fmt.Sprintf("[%d:a]volume=%.2f[bgm_vol]", bgmIdx, vol))
			filterParts = append(filterParts, "[bgm_vol][voice_sc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=250[bgm_duck]")
			filterParts = append(filterParts, "[voice_mix][bgm_duck]amix=inputs=2:duration=first:dropout_transition=2[audio_final]")
			currentAudioStream = "audio_final"
		} else {
			filterParts = append(filterParts, fmt.Sprintf("[%d:a]volume=%.2f[audio_final]", bgmIdx, vol))
			currentAudioStream = "audio_final"
		}
	}

	// 5. Timed Subtitles (drawtext)
	if len(p.Subtitles) > 0 {
		subStream := "sub_out"
		var drawtexts []string
		fontSize := 42
		if p.Output.Resolution == "720p" {
			fontSize = 32
		}
		dir := filepath.Dir(outputPath)
		for index, s := range p.Subtitles {
			path := filepath.Join(dir, fmt.Sprintf("subtitle_%d.txt", index))
			if err := os.WriteFile(path, []byte(s.Text), 0o644); err != nil {
				continue
			}
			drawtexts = append(drawtexts, fmt.Sprintf("drawtext=textfile='%s':fontsize=%d:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.82:enable='between(t,%.2f,%.2f)'", escapeFilterPath(path), fontSize, s.StartTime, s.EndTime))
		}
		if len(drawtexts) > 0 {
			filterParts = append(filterParts, fmt.Sprintf("[%s]%s[%s]", currentVideoStream, strings.Join(drawtexts, ","), subStream))
			currentVideoStream = subStream
		}
	}

	filterStr := strings.Join(filterParts, ";\n")
	args = append(args, "-filter_complex", filterStr)
	args = append(args, "-map", fmt.Sprintf("[%s]", currentVideoStream))

	if currentAudioStream != "" {
		args = append(args, "-map", fmt.Sprintf("[%s]", currentAudioStream))
	}

	args = append(args, "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-pix_fmt", "yuv420p")
	if currentAudioStream != "" {
		args = append(args, "-c:a", "aac", "-b:a", "192k")
	}
	args = append(args, "-movflags", "+faststart", outputPath)

	return "ffmpeg " + strings.Join(args, " "), args
}

func escapeFilterPath(path string) string {
	path = strings.ReplaceAll(path, `\`, `\\`)
	path = strings.ReplaceAll(path, ":", `\:`)
	path = strings.ReplaceAll(path, "'", `\'`)
	return path
}

func clipSeconds(clip ComposeClip) float64 {
	if clip.Duration <= 0 {
		return 3
	}
	return clip.Duration
}

func audioJoinFilters(clips []ComposeClip) (string, []string) {
	if len(clips) == 0 {
		return "", nil
	}
	if len(clips) == 1 {
		return "a0", nil
	}
	filters := make([]string, 0, len(clips)-1)
	current := "a0"
	for i := 1; i < len(clips); i++ {
		next := fmt.Sprintf("ajoin%d", i)
		if clips[i].Transition == "ffmpeg_fade" {
			filters = append(filters, fmt.Sprintf("[%s][a%d]acrossfade=d=0.50:c1=tri:c2=tri[%s]", current, i, next))
		} else {
			filters = append(filters, fmt.Sprintf("[%s][a%d]concat=n=2:v=0:a=1[%s]", current, i, next))
		}
		current = next
	}
	return current, filters
}

// Compose handles rendering timeline clips into final MP4 video via FFmpeg
func Compose(cfg config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
		if err != nil || !json.Valid(body) {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "无效的 JSON 请求"})
			return
		}
		var payload ComposePayload
		if json.Unmarshal(body, &payload) != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "JSON 解析失败"})
			return
		}
		if len(payload.Clips) == 0 {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "没有可合成的片段"})
			return
		}
		workspace := httpx.WorkspaceFrom(r)
		outDir, resultURL, err := prepareComposeOutput(workspace, payload.ProjectID)
		if err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
			return
		}
		if err := materializeComposeInputs(r.Context(), cfg.Root, &payload, outDir); err != nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": err.Error()})
			return
		}
		fileName := fmt.Sprintf("video_sales_%d.mp4", time.Now().UnixMilli())
		outPath := filepath.Join(outDir, fileName)
		_, args := BuildFFmpegCommand(payload, outPath)

		ffmpegPath, lookErr := exec.LookPath("ffmpeg")
		if lookErr != nil || ffmpegPath == "" {
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "未安装 ffmpeg，无法合成视频"})
			return
		}
		cmd := exec.CommandContext(r.Context(), ffmpegPath, args...)
		if runErr := cmd.Run(); runErr != nil {
			_ = os.Remove(outPath)
			httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"success": false, "error": "视频合成失败"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"success":   true,
			"resultUrl": resultURL + "/" + fileName,
			"executed":  true,
		})
	})
}
