package sales

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"

	"beike.local/cloud/src/backend/internal/system"
)

func TestScriptAspectRatioSnapsToGenerationRatios(t *testing.T) {
	cases := map[string][2]int{"9:16": {1080, 1920}, "16:9": {1920, 1080}, "3:4": {1080, 1440}, "1:1": {720, 720}}
	for want, size := range cases {
		if got := scriptAspectRatio(size[0], size[1]); got != want {
			t.Fatalf("%v => %s, want %s", size, got, want)
		}
	}
}

func TestEnrichScriptMediaHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := enrichScriptMedia(ctx, "", "local", "/storage/local/ref.mp4", map[string]any{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled analysis must stop before probing/extracting: %v", err)
	}
}

func TestScriptVideoUploadProbesWithoutStoringSourceFrames(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	source := filepath.Join(t.TempDir(), "ref.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=25:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", source)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("encode: %v\n%s", err, out)
	}
	raw, _ := os.ReadFile(source)
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "ref.mp4")
	_, _ = part.Write(raw)
	_ = form.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/sales/script-video", &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	recorder := httptest.NewRecorder()
	cfg := config.Config{Root: root}
	ScriptVideoUpload(cfg).ServeHTTP(recorder, request)
	var uploaded struct {
		VideoURL    string  `json:"videoUrl"`
		DurationSec float64 `json:"durationSec"`
		AspectRatio string  `json:"aspectRatio"`
		HasAudio    bool    `json:"hasAudio"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &uploaded)
	if recorder.Code != 200 || !strings.HasPrefix(uploaded.VideoURL, "/storage/local/") || uploaded.AspectRatio != "9:16" || uploaded.DurationSec < 1.9 || uploaded.HasAudio {
		t.Fatalf("upload %d %s", recorder.Code, recorder.Body.String())
	}
	script := map[string]any{"durationSec": 9.0, "voiceMode": "speech", "shots": []any{map[string]any{"start": 0.0, "end": 2.0, "beats": []any{map[string]any{"start": 0.0, "end": 1.0, "action": "蓝色画面保持静止"}, map[string]any{"start": 1.0, "end": 2.0, "action": "延续蓝色静止画面"}}}}}
	if err := enrichScriptMedia(context.Background(), root, "local", uploaded.VideoURL, script); err != nil {
		t.Fatal(err)
	}
	if script["voiceMode"] != "none" || script["audioAvailable"] != false || script["durationSec"].(float64) > 2.1 {
		t.Fatalf("measured media should replace model guesses: %#v", script)
	}
	beat := script["shots"].([]any)[0].(map[string]any)["beats"].([]any)[1].(map[string]any)
	if beat["previewFrameUrl"] != nil {
		t.Fatal("original video frames must not be stored")
	}
}

func TestScriptVideoUploadRejectsUnsupportedFiles(t *testing.T) {
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "ref.gif")
	_, _ = part.Write([]byte("GIF89a"))
	_ = form.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/sales/script-video", &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	recorder := httptest.NewRecorder()
	ScriptVideoUpload(config.Config{}).ServeHTTP(recorder, request)
	if recorder.Code != 400 {
		t.Fatalf("gif should be rejected: %d", recorder.Code)
	}
}
