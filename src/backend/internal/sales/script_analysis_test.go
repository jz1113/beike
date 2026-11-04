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

	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/system"
)

const validScript = `{"title":"开衫穿搭","durationSec":6,"format":"presenter","voiceMode":"none","audioAvailable":true,"shots":[{"start":0,"end":6,"beats":[{"start":0,"end":2,"action":"坐姿看镜头"},{"start":2,"end":6,"action":"起身转身"}]}]}`

func scriptCompletion(content, finish string) map[string]any {
	return map[string]any{"choices": []any{map[string]any{"finish_reason": finish, "message": map[string]any{"content": content}}}}
}

func TestParseScriptCompletionKeepsContinuousShot(t *testing.T) {
	script, err := parseScriptCompletion(scriptCompletion("```json\n"+validScript+"\n```", "stop"))
	if err != nil {
		t.Fatal(err)
	}
	if shots, _ := script["shots"].([]any); len(shots) != 1 {
		t.Fatalf("one continuous shot should stay one shot: %#v", script["shots"])
	}
}

func TestParseScriptCompletionRejectsBrokenTimeline(t *testing.T) {
	cases := map[string]string{
		"overlap":   `{"durationSec":6,"shots":[{"start":0,"end":4,"beats":[{"start":0,"end":3},{"start":1,"end":4}]}]}`,
		"outside":   `{"durationSec":6,"shots":[{"start":0,"end":4,"beats":[{"start":0,"end":5}]}]}`,
		"duration":  `{"durationSec":0,"shots":[]}`,
		"no beats":  `{"durationSec":6,"shots":[{"start":0,"end":6,"beats":[]}]}`,
		"shot back": `{"durationSec":6,"shots":[{"start":0,"end":4,"beats":[{"start":0,"end":4}]},{"start":2,"end":6,"beats":[{"start":2,"end":6}]}]}`,
	}
	for name, body := range cases {
		if _, err := parseScriptCompletion(scriptCompletion(body, "stop")); err == nil {
			t.Fatalf("%s should fail", name)
		}
	}
	if _, err := parseScriptCompletion(scriptCompletion(validScript, "length")); err == nil {
		t.Fatal("truncated output must not be accepted")
	}
}

func runScriptHandler(t *testing.T, body string, complete summaryCompleter, read scriptVideoReader) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	request := httptest.NewRequest(http.MethodPost, "/api/sales/script-analysis", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	scriptAnalysisHandler(setupPromptExecutionTestConfig(t), complete, read).ServeHTTP(recorder, request)
	var data map[string]any
	_ = json.Unmarshal(recorder.Body.Bytes(), &data)
	return recorder, data
}

func TestScriptAnalysisExtractsFramesForNonGeminiProtocols(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	t.Setenv("AI_DRAWING_API_KEY", "test-key")
	source := filepath.Join(t.TempDir(), "ref.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=25:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", source)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("encode: %v\n%s", err, out)
	}
	raw, _ := os.ReadFile(source)
	var formBody bytes.Buffer
	form := multipart.NewWriter(&formBody)
	part, _ := form.CreateFormFile("file", "ref.mp4")
	_, _ = part.Write(raw)
	_ = form.Close()
	uploadReq := httptest.NewRequest(http.MethodPost, "/api/sales/script-video", &formBody)
	uploadReq.Header.Set("Content-Type", form.FormDataContentType())
	uploadRec := httptest.NewRecorder()
	cfg := setupPromptExecutionTestConfig(t)
	cfg.Root = root
	ScriptVideoUpload(cfg).ServeHTTP(uploadRec, uploadReq)
	var uploaded struct {
		VideoURL string `json:"videoUrl"`
	}
	_ = json.Unmarshal(uploadRec.Body.Bytes(), &uploaded)

	var sent gateway.TextRequest
	completion := validScript
	complete := func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		sent = req
		return 200, scriptCompletion(completion, "stop"), nil
	}
	body := `{"videoUrl":"` + uploaded.VideoURL + `","model":"gemini-3.8-flash","textProtocol":"openai","reasoningEffort":"high"}`
	invalidRec := httptest.NewRecorder()
	scriptAnalysisHandler(cfg, complete, readScriptVideo).ServeHTTP(invalidRec, httptest.NewRequest(http.MethodPost, "/api/sales/script-analysis", strings.NewReader(body)))
	if invalidRec.Code != 502 || !strings.Contains(invalidRec.Body.String(), "实测时长") {
		t.Fatalf("six-second script must not succeed for a two-second video: %d %s", invalidRec.Code, invalidRec.Body.String())
	}
	if _, err := localScriptVideoFile(uploaded.VideoURL, "local"); err == nil {
		t.Fatal("failed analysis retained original")
	}
	// Retry with a fresh upload; neither attempt may retain video bytes.
	formBody.Reset()
	form = multipart.NewWriter(&formBody)
	part, _ = form.CreateFormFile("file", "ref.mp4")
	_, _ = part.Write(raw)
	form.Close()
	uploadReq = httptest.NewRequest(http.MethodPost, "/api/sales/script-video", &formBody)
	uploadReq.Header.Set("Content-Type", form.FormDataContentType())
	uploadRec = httptest.NewRecorder()
	ScriptVideoUpload(cfg).ServeHTTP(uploadRec, uploadReq)
	var retry struct {
		VideoURL string `json:"videoUrl"`
	}
	if json.Unmarshal(uploadRec.Body.Bytes(), &retry) != nil || retry.VideoURL == "" {
		t.Fatal("retry upload failed")
	}
	body = strings.Replace(body, uploaded.VideoURL, retry.VideoURL, 1)

	completion = `{"durationSec":2,"shots":[{"start":0,"end":2,"beats":[{"start":0,"end":2,"action":"展示商品"}]}]}`
	request := httptest.NewRequest(http.MethodPost, "/api/sales/script-analysis", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	scriptAnalysisHandler(cfg, complete, readScriptVideo).ServeHTTP(recorder, request)
	if recorder.Code != 200 {
		t.Fatalf("expected non-gemini protocol to analyze sampled frames: %d %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Script map[string]any `json:"script"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &response)
	if _, err := validateScriptObject(response.Script); err != nil {
		t.Fatalf("successful analysis must remain saveable: %v", err)
	}
	if _, err := localScriptVideoFile(retry.VideoURL, "local"); err == nil {
		t.Fatal("successful analysis retained original")
	}
	payloadRaw, _ := json.Marshal(sent.Payload)
	if !strings.Contains(string(payloadRaw), "image_url") || strings.Contains(string(payloadRaw), "video_url") || sent.Payload["reasoning_effort"] != "high" {
		t.Fatalf("expected sampled image frames and reasoning_effort=high: %s", payloadRaw)
	}
}

func TestScriptAnalysisSendsVideoAndReturnsScript(t *testing.T) {
	var sent gateway.TextRequest
	complete := func(_ context.Context, req gateway.TextRequest, _ bool) (int, map[string]any, error) {
		sent = req
		return 200, scriptCompletion(validScript, "stop"), nil
	}
	recorder, data := runScriptHandler(t, `{"videoUrl":"/storage/local/a.mp4","model":"gemini-2.5-pro","textProtocol":"gemini","reasoningEffort":"medium"}`, complete, func(string, string) (string, error) { return "data:video/mp4;base64,AA==", nil })
	if recorder.Code != 200 || data["success"] != true || data["script"] == nil {
		t.Fatalf("unexpected response %d %#v", recorder.Code, data)
	}
	assertRequestPrompt(t, sent, scriptAnalysisPrompt)
	messages := sent.Payload["messages"].([]any)
	parts := messages[1].(map[string]any)["content"].([]any)
	if parts[len(parts)-1].(map[string]any)["text"] != scriptOutputFields {
		t.Fatal("in-app analysis needs the storyboard format alongside the media")
	}
	raw, _ := json.Marshal(sent.Payload)
	if !strings.Contains(string(raw), "video_url") || sent.Protocol != "gemini" || sent.Payload["reasoning_effort"] != "medium" {
		t.Fatalf("video must be sent natively with reasoning effort: %s", raw)
	}
}

func TestScriptAnalysisReportsUnreadableVideo(t *testing.T) {
	complete := func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("model must not be called without the video")
		return 0, nil, nil
	}
	recorder, _ := runScriptHandler(t, `{"videoUrl":"/storage/local/a.mp4","model":"gemini-2.5-pro","textProtocol":"gemini"}`, complete, func(string, string) (string, error) { return "", errors.New("参考视频超过 16 MB") })
	if recorder.Code != 400 {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}

func TestScriptAnalysisRejectsInvalidReasoningEffort(t *testing.T) {
	complete := func(context.Context, gateway.TextRequest, bool) (int, map[string]any, error) {
		t.Fatal("model must not be called on invalid reasoningEffort")
		return 0, nil, nil
	}
	recorder, data := runScriptHandler(t, `{"videoUrl":"/storage/local/a.mp4","model":"gemini-2.5-pro","textProtocol":"gemini","reasoningEffort":"extreme"}`, complete, func(string, string) (string, error) { return "data:video/mp4;base64,AA==", nil })
	if recorder.Code != 400 || !strings.Contains(data["error"].(string), "思考强度") {
		t.Fatalf("expected 400 reasoningEffort error, got %d %#v", recorder.Code, data)
	}
}

func TestReadScriptVideoRejectsUnsafeSources(t *testing.T) {
	for _, source := range []string{"blob:http://x/1", "/etc/passwd", "https://example.com/a.mp4", "file:///tmp/a.mp4"} {
		if _, err := readScriptVideo(source, "default"); err == nil {
			t.Fatalf("%s should be rejected", source)
		}
	}
}

func TestSampledAnalysisCannotPublishAnUnheardTranscript(t *testing.T) {
	voice := map[string]any{"text": "虚构原话", "linePattern": "原片保证的效果"}
	script := map[string]any{"shots": []any{map[string]any{"beats": []any{map[string]any{"voice": voice, "subtitle": "可见字幕"}}}}}
	recordScriptObservations([]any{map[string]any{"text": `{"mediaType":"sampled_frames","sampleTimesSec":[0,1.5],"audioProvided":false}`}}, script)
	if voice["text"] != "" || voice["linePattern"] != "" || voice["uncertain"] != true || len(script["sampleTimesSec"].([]float64)) != 2 {
		t.Fatal(script)
	}
}
