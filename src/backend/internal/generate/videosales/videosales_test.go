package videosales

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestAnalyzeFallback(t *testing.T) {
	cfg := config.Config{}
	handler := Analyze(cfg)

	body := map[string]any{
		"productName":   "测试美妆精华液",
		"category":      "beauty",
		"imageUrls":     []string{"https://example.com/item.png"},
		"allowFallback": true,
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/generate/video-sales/analyze", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var res map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}
	if res["success"] != true {
		t.Fatalf("expected success true, got %v", res["success"])
	}
	analysis, ok := res["analysis"].(map[string]any)
	if !ok || analysis["productName"] == "" {
		t.Fatalf("invalid analysis result: %v", res)
	}
}

func TestScriptFallback(t *testing.T) {
	cfg := config.Config{}
	handler := Script(cfg)

	body := map[string]any{
		"productName":   "德宝湿水不破纸巾",
		"category":      "home",
		"videoMode":     "product_closeup",
		"styleType":     "pain_point",
		"allowFallback": true,
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/generate/video-sales/script", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var res struct {
		Success bool          `json:"success"`
		Scripts []SalesScript `json:"scripts"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}
	if !res.Success || len(res.Scripts) == 0 {
		t.Fatalf("expected scripts output, got %v", res)
	}
	if len(res.Scripts[0].Shots) == 0 {
		t.Fatalf("expected shots in first script, got 0")
	}
	if res.Scripts[0].SEO.Title == "" {
		t.Fatalf("expected SEO title, got empty")
	}
}

func TestBuildFFmpegCommand(t *testing.T) {
	payload := ComposePayload{
		ProjectID: "proj_test_123",
		Clips: []ComposeClip{
			{
				Type:       "image",
				FilePath:   "/tmp/test_product.jpg",
				Duration:   3.0,
				Transition: "direct_concat",
				Motion:     "zoom_in_slow",
			},
			{
				Type:       "video",
				FilePath:   "/tmp/test_clip.mp4",
				Duration:   4.0,
				Transition: "ffmpeg_fade",
				HasAudio:   true,
			},
		},
		Output: ComposeOutputSpec{
			Resolution:  "1080p",
			AspectRatio: "9:16",
			BgmPath:     "/tmp/bgm.mp3",
			BgmVolume:   0.3,
		},
		Subtitles: []ComposeSubtitle{
			{
				Text:      "湿水不破的神仙好物",
				StartTime: 0.0,
				EndTime:   3.0,
			},
		},
	}

	cmdStr, args := BuildFFmpegCommand(payload, "/tmp/out.mp4")
	if cmdStr == "" || len(args) == 0 {
		t.Fatalf("expected non-empty command and args")
	}
}

func TestVoiceoverDucksBackgroundMusic(t *testing.T) {
	payload := ComposePayload{
		Clips:  []ComposeClip{{Type: "image", FilePath: "a.jpg", Duration: 3, AudioURL: "voice.mp3"}},
		Output: ComposeOutputSpec{BgmPath: "bgm.mp3", BgmVolume: 0.2, AspectRatio: "9:16"},
	}
	_, args := BuildFFmpegCommand(payload, "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "voice.mp3") || !strings.Contains(joined, "sidechaincompress") || !strings.Contains(joined, "bgm.mp3") {
		t.Fatalf("missing ducked voiceover: %s", joined)
	}
}

func TestFadeOffsetUsesRunningTimeline(t *testing.T) {
	payload := ComposePayload{Clips: []ComposeClip{
		{Type: "image", FilePath: "a.jpg", Duration: 3},
		{Type: "image", FilePath: "b.jpg", Duration: 4, Transition: "ffmpeg_fade"},
		{Type: "image", FilePath: "c.jpg", Duration: 5, Transition: "ffmpeg_fade"},
	}}
	_, args := BuildFFmpegCommand(payload, "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "offset=2.50") || !strings.Contains(joined, "offset=6.00") {
		t.Fatalf("fade offsets missing: %s", joined)
	}
}

func TestComposePathsRejectEscape(t *testing.T) {
	if _, _, err := prepareComposeOutput("local", "../etc"); err == nil {
		t.Fatal("expected project id rejection")
	}
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if _, err := resolveComposeMedia(t.Context(), "/etc/passwd", root, "clip"); err == nil {
		t.Fatal("expected absolute path rejection")
	}
}
