package videosales

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/generate"
)

func useChatServer(t *testing.T, reply func(body map[string]any, calls int) string) *httptest.Server {
	t.Helper()
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		content := reply(body, calls)
		encoded, _ := json.Marshal(map[string]any{"choices": []map[string]any{{"message": map[string]string{"content": content}}}})
		_, _ = w.Write(encoded)
	}))
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() {
		generate.ModelHTTP = previous
		server.Close()
	})
	return server
}

func postSales(t *testing.T, handler http.Handler, path string, payload map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	// This helper serves OpenAI-compatible fixture replies; native routing is
	// covered separately without this explicit override.
	req.Header.Set("x-text-protocol", "openai")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestAnalyzeRejectsEmptyObject(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string { return "{}" })
	rec := postSales(t, Analyze(config.Config{}), "/api/generate/video-sales/analyze", map[string]any{
		"workflowVersion": 3, "productName": "纸巾", "customBaseUrl": server.URL, "customApiKey": "test",
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}}, "eligibleImageIndexes": []int{0},
	})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestAnalyzeCoversEveryImageBatch(t *testing.T) {
	var calls int
	var batchMiss string
	server := useChatServer(t, func(body map[string]any, call int) string {
		calls = call
		encoded, _ := json.Marshal(body)
		if call < 3 && !strings.Contains(string(encoded), "image_url") {
			batchMiss = "batch should include images"
		}
		return `{"productName":"纸巾","category":"home","sellingPoints":["湿水不易破"],"targetAudience":"家庭","knownFacts":["白色包装"],"creativeNotes":["先拍正面"]}`
	})
	images := make([]map[string]any, 5)
	indexes := make([]int, 5)
	for i := range images {
		indexes[i] = i
		images[i] = map[string]any{"index": i, "url": "https://example.com/" + string(rune('1'+i)) + ".jpg", "role": "main"}
	}
	rec := postSales(t, Analyze(config.Config{}), "/api/generate/video-sales/analyze", map[string]any{
		"workflowVersion": 3, "productName": "纸巾", "imageCatalog": images, "eligibleImageIndexes": indexes,
		"customBaseUrl": server.URL, "customApiKey": "test",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", rec.Code, rec.Body.String())
	}
	if batchMiss != "" {
		t.Fatal(batchMiss)
	}
	if calls != 3 {
		t.Fatalf("expected 2 batches plus summary, got %d", calls)
	}
	var res struct {
		Analysis ProductAnalysisResult `json:"analysis"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Analysis.CoveredImageCount != 5 || res.Analysis.ImageCount != 5 || res.Analysis.Degraded {
		t.Fatalf("unexpected coverage: %+v", res.Analysis)
	}
}

func TestScriptRejectsEmptyStoryboard(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string { return `{"scripts":[{}]}` })
	rec := postSales(t, Script(config.Config{}), "/api/generate/video-sales/script", map[string]any{
		"workflowVersion": 3, "productName": "纸巾", "targetDuration": 15, "aspectRatio": "9:16",
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}}, "eligibleImageIndexes": []int{0},
		"customBaseUrl": server.URL, "customApiKey": "test",
	})
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "分镜") {
		t.Fatalf("expected script rejection, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestSelectRejectsUnknownImage(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"assignments":[{"shotId":1,"imageIndex":9,"reason":"不存在"}]}`
	})
	rec := postSales(t, Select(config.Config{}), "/api/generate/video-sales/select-images", map[string]any{
		"workflowVersion": 3, "customBaseUrl": server.URL, "customApiKey": "test",
		"shots":                []map[string]any{{"shotId": 1, "description": "正面", "voiceover": "看这里"}},
		"imageCatalog":         []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}},
		"eligibleImageIndexes": []int{0},
	})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestFashionScriptPromptLocksReferences(t *testing.T) {
	body := workflowScriptBody("gemini", map[string]any{"productName": "衬衫", "category": "fashion"}, nil, 15, "9:16")
	encoded, _ := json.Marshal(body)
	text := string(encoded)
	for _, piece := range []string{"开箱换装", "生活穿搭", "鞋包展示", "usesProduct"} {
		if !strings.Contains(text, piece) {
			t.Fatalf("missing %s", piece)
		}
	}
}

func TestScriptPromptOmitsPrice(t *testing.T) {
	facts := analysisFactText(analysisFactsFrom(map[string]any{"productName": "卫衣", "priceRange": "168元", "brand": "海澜之家"}))
	if strings.Contains(facts, "168") || strings.Contains(facts, "价格") {
		t.Fatal(facts)
	}
	workflow := workflowScriptBody("gemini", map[string]any{"priceRange": "168元", "productName": "卫衣", "category": "fashion"}, nil, 15, "9:16")
	encoded, _ := json.Marshal(workflow)
	if strings.Contains(string(encoded), "168元") || strings.Contains(string(encoded), "priceRange") {
		t.Fatal("workflow script included a price")
	}
	if !strings.Contains(string(encoded), "口播不要出现价格") {
		t.Fatal("script prompt should forbid price in voiceover")
	}
}

func TestGenericScriptStaysForOtherCategories(t *testing.T) {
	body := workflowScriptBody("gemini", map[string]any{"productName": "纸巾", "category": "home"}, nil, 15, "9:16")
	encoded, _ := json.Marshal(body)
	if strings.Contains(string(encoded), "开箱换装") {
		t.Fatal("home category used the fashion skill")
	}
	if !strings.Contains(string(encoded), "ai_generate") || !strings.Contains(string(encoded), "product_image") {
		t.Fatal("generic script should distinguish scene shots from product shots")
	}
}

func TestNormalizeFashionBeat(t *testing.T) {
	if normalizeFashionBeat("", "运动鞋") != "accessory" || normalizeFashionBeat("lifestyle", "运动鞋") != "lifestyle" {
		t.Fatal("beat normalization failed for shoes")
	}
	if normalizeFashionBeat("", "连衣裙") != "unbox" {
		t.Fatal("clothing should default to unbox")
	}
}

func TestNormalizeKeepsSceneVisualSource(t *testing.T) {
	script := normalizeScript(SalesScript{Title: "方案", Shots: []ScriptShot{
		{ShotId: 1, Description: "人在客厅", Voiceover: "看这里", Prompt: "草稿", VisualSource: "ai_generate"},
		{ShotId: 2, Description: "包装特写", Voiceover: "再看", Prompt: "草稿", VisualSource: "avatar_presenter"},
	}})
	if script.Shots[0].VisualSource != "ai_generate" || script.Shots[1].VisualSource != "product_image" {
		t.Fatalf("visual source was not kept: %+v", script.Shots)
	}
}

func TestStorageURLResolvesInsideRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	if err := os.WriteFile(filepath.Join(root, "clip.mp4"), []byte("video"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := resolveComposeMedia(t.Context(), "/storage/clip.mp4", root, "clip")
	if err != nil || got != filepath.Join(root, "clip.mp4") {
		t.Fatalf("storage url: %s %v", got, err)
	}
}

func TestVideoClipIsTrimmed(t *testing.T) {
	payload := ComposePayload{Clips: []ComposeClip{{Type: "video", FilePath: "a.mp4", Duration: 4, HasAudio: true}}}
	_, args := BuildFFmpegCommand(payload, "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-t 4.00 -i a.mp4") || !strings.Contains(joined, "fps=30") || !strings.Contains(joined, "apad=whole_dur=4.00") {
		t.Fatalf("video was not trimmed: %s", joined)
	}
}

func TestFadeAudioFollowsVideoOverlap(t *testing.T) {
	payload := ComposePayload{Clips: []ComposeClip{
		{Type: "video", FilePath: "a.mp4", Duration: 3, HasAudio: true},
		{Type: "video", FilePath: "b.mp4", Duration: 4, HasAudio: true, Transition: "ffmpeg_fade"},
	}}
	_, args := BuildFFmpegCommand(payload, "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "acrossfade=d=0.50") || !strings.Contains(joined, "xfade=transition=fade") {
		t.Fatalf("fade timeline missing: %s", joined)
	}
}
