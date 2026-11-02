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
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/storage"
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

func TestScriptVideoUploadProbesAndEnrichesBeatFrames(t *testing.T) {
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
	frame, _ := beat["previewFrameUrl"].(string)
	if frame == "" || storage.StoredFile(strings.TrimPrefix(frame, "/storage/")) == "" {
		t.Fatalf("preview frame missing: %#v", beat)
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

func runNormalize(t *testing.T, body string, complete summaryCompleter) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	recorder := httptest.NewRecorder()
	scriptNormalizeHandler(setupSalesTestConfig(t), complete).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/sales/script-normalize", strings.NewReader(body)))
	var data map[string]any
	_ = json.Unmarshal(recorder.Body.Bytes(), &data)
	return recorder, data
}

func TestScriptNormalizeAcceptsPastedJSONWithoutModel(t *testing.T) {
	pasted := strings.Replace(validScript, `"durationSec":6,`, "", 1)
	raw, _ := json.Marshal(map[string]any{"rawText": "结果：\n```json\n{\"script\":" + pasted + "}\n```"})
	recorder, data := runNormalize(t, string(raw), func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("complete JSON must not call a model")
		return 0, nil, nil
	})
	script, _ := data["script"].(map[string]any)
	if recorder.Code != 200 || script["durationSec"] != 6.0 {
		t.Fatalf("pasted JSON %d %#v", recorder.Code, data)
	}
}

func TestScriptNormalizeUsesModelForFreeText(t *testing.T) {
	recorder, data := runNormalize(t, `{"rawText":"镜头一（00:00-00:02）：她坐在桌前看镜头"}`, func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("model is required before calling upstream")
		return 0, nil, nil
	})
	if recorder.Code != 400 || !strings.Contains(data["error"].(string), "文本模型") {
		t.Fatalf("free text without model: %d %#v", recorder.Code, data)
	}
	var sent gateway.TextRequest
	recorder, data = runNormalize(t, `{"rawText":"镜头一（00:00-00:02）：她坐在桌前看镜头","model":"gpt-4o"}`, func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		sent = req
		return 200, scriptCompletion(validScript, "stop"), nil
	})
	payload, _ := json.Marshal(sent.Payload)
	if recorder.Code != 200 || data["script"] == nil || !strings.Contains(string(payload), "规整外部拆解结果") {
		t.Fatalf("free text normalize %d %#v %s", recorder.Code, data, payload)
	}
}
