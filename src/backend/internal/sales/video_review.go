package sales

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os/exec"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/network"
	"beike.local/cloud/src/backend/internal/system"
)

func VideoReview(cfg config.Config) http.HandlerFunc {
	client := network.SafeClient()
	return func(w http.ResponseWriter, r *http.Request) {
		fail := func(code int, reason string) {
			httpx.WriteJSON(w, code, map[string]any{"success": false, "error": reason})
		}
		var body struct {
			VideoURL string `json:"videoUrl"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
		if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || body.VideoURL == "" {
			fail(400, "请选择要核查的视频")
			return
		}
		ffmpeg, ok := system.FFmpegBinary(cfg.Root)
		if !ok {
			fail(503, "当前环境缺少 FFmpeg，无法核查音视频")
			return
		}
		file, cleanup, err := resolveAudioMixMedia(r.Context(), body.VideoURL, httpx.WorkspaceFrom(r), true, client)
		defer cleanup()
		if err != nil {
			fail(400, err.Error())
			return
		}
		probe, err := system.ProbeLocalVideo(r.Context(), cfg.Root, file)
		if err != nil {
			fail(422, err.Error())
			return
		}
		picture := reviewPicture(r.Context(), ffmpeg, file)
		audio := "missing"
		if probe.HasAudio {
			peak, err := salesAudioPeak(r.Context(), ffmpeg, file)
			switch {
			case err != nil:
				audio = "unreadable"
			case peak < salesQuietPeakDB:
				audio = "quiet"
			default:
				audio = "audible"
			}
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "picture": picture, "audio": audio,
			"width": probe.Width, "height": probe.Height, "durationSec": roundTenth(probe.Duration)})
	}
}

// Decode the video stream to small luminance frames. Report a black picture only
// when every decoded frame has fewer than 2% of pixels above near-black.
func reviewPicture(ctx context.Context, ffmpeg, file string) string {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	args := append([]string{"-v", "error", "-xerror"}, audioMixInputArgs(file)...)
	args = append(args, "-map", "0:v:0", "-an", "-vf", "scale=32:32", "-vsync", "0", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1")
	cmd := exec.CommandContext(ctx, ffmpeg, args...)
	out, err := cmd.StdoutPipe()
	if err != nil || cmd.Start() != nil {
		return "unreadable"
	}
	frame := make([]byte, 32*32)
	frames, visible := 0, false
	for {
		_, err = io.ReadFull(out, frame)
		if err != nil {
			break
		}
		frames++
		if !visible {
			lit := 0
			for _, pixel := range frame {
				if pixel > 16 {
					lit++
				}
			}
			visible = lit*100 >= 2*len(frame)
		}
	}
	if cmd.Wait() != nil || err != io.EOF || frames == 0 {
		return "unreadable"
	}
	if !visible {
		return "dark"
	}
	return "visible"
}
