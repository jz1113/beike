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
		"productName": "纸巾", "imageUrls": []string{"https://example.com/a.jpg"}, "customBaseUrl": server.URL, "customApiKey": "test",
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
	images := []string{"https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg", "https://example.com/4.jpg", "https://example.com/5.jpg"}
	rec := postSales(t, Analyze(config.Config{}), "/api/generate/video-sales/analyze", map[string]any{
		"productName": "纸巾", "imageUrls": images, "customBaseUrl": server.URL, "customApiKey": "test",
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
		"productName": "纸巾", "customBaseUrl": server.URL, "customApiKey": "test",
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
		"customBaseUrl": server.URL, "customApiKey": "test",
		"shots":        []map[string]any{{"shotId": 1, "description": "正面", "voiceover": "看这里"}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}},
	})
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestFinalizeRequiresPromptForEveryShot(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"prompts":[{"shotId":1,"prompt":""}]}`
	})
	rec := postSales(t, Finalize(config.Config{}), "/api/generate/video-sales/finalize-prompts", map[string]any{
		"customBaseUrl": server.URL, "customApiKey": "test",
		"shots":        []map[string]any{{"shotId": 1, "imageIndex": 0, "description": "正面", "voiceover": "看这里", "duration": 4}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}},
	})
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "最终提示词") {
		t.Fatalf("expected prompt rejection, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestFashionScriptPromptLocksReferences(t *testing.T) {
	body := scriptChatBody("gemini", map[string]any{
		"targetDuration":    15,
		"fashionReferences": map[string]any{"person": true, "face": false, "scene": true},
	}, "衬衫", "fashion", "product_closeup", "垂坠", "")
	encoded, _ := json.Marshal(body)
	text := string(encoded)
	for _, piece := range []string{"开箱换装", "生活穿搭", "没有单独人脸", "有场景参考", "不要写死图片编号"} {
		if !strings.Contains(text, piece) {
			t.Fatalf("missing %s in %s", piece, text)
		}
	}
}

func TestGenericScriptStaysForOtherCategories(t *testing.T) {
	body := scriptChatBody("gemini", map[string]any{"targetDuration": 15}, "纸巾", "home", "product_closeup", "湿水", "")
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

func TestFashionFinalizeUsesReferenceOrder(t *testing.T) {
	var sawOrder, sawStills bool
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		text := string(encoded)
		if strings.Contains(text, "图片1：出镜人物") && strings.Contains(text, "图片2：服饰单品") {
			sawOrder = true
		}
		sawStills = strings.Contains(text, "实拍照片") && strings.Contains(text, "personImagePrompt")
		return `{"fullPrompt":"整段提示词锁定人物和衣服","personImagePrompt":"实拍出镜人物","sceneImagePrompt":"实拍客厅","prompts":[{"shotId":1,"prompt":"前段展示衣服"}]}`
	})
	rec := postSales(t, Finalize(config.Config{}), "/api/generate/video-sales/finalize-prompts", map[string]any{
		"customBaseUrl": server.URL, "customApiKey": "test", "category": "fashion",
		"shots":        []map[string]any{{"shotId": 1, "imageIndex": 0, "description": "展示", "voiceover": "看这件", "camera": "中景", "duration": 4}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/coat.jpg", "role": "main"}},
		"referenceOrder": []map[string]any{
			{"slot": "person", "label": "出镜人物", "url": "https://example.com/person.jpg"},
			{"slot": "garment", "label": "服饰单品", "url": "https://example.com/coat.jpg", "imageIndex": 0},
		},
	})
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "整段提示词锁定人物和衣服") {
		t.Fatalf("expected full prompt, got %d %s", rec.Code, rec.Body.String())
	}
	if !sawOrder || !sawStills {
		t.Fatal("finalize should repeat the reference order and ask for realistic stills")
	}
	if !strings.Contains(rec.Body.String(), "实拍出镜人物") || !strings.Contains(rec.Body.String(), "实拍客厅") {
		t.Fatalf("expected still prompts, got %s", rec.Body.String())
	}
}

func TestFashionFinalizeRequiresFullPrompt(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"prompts":[{"shotId":1,"prompt":"只有分段"}]}`
	})
	rec := postSales(t, Finalize(config.Config{}), "/api/generate/video-sales/finalize-prompts", map[string]any{
		"customBaseUrl": server.URL, "customApiKey": "test", "category": "fashion",
		"shots":        []map[string]any{{"shotId": 1, "imageIndex": 0, "description": "展示", "voiceover": "看这件", "duration": 4}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/coat.jpg", "role": "main"}},
		"referenceOrder": []map[string]any{
			{"slot": "person", "label": "出镜人物", "url": "https://example.com/person.jpg"},
			{"slot": "garment", "label": "服饰单品", "url": "https://example.com/coat.jpg"},
		},
	})
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "完整视频提示词") {
		t.Fatalf("expected full prompt rejection, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestFashionFinalizeRequiresStillPrompts(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"fullPrompt":"整段提示词","prompts":[{"shotId":1,"prompt":"前段展示衣服"}]}`
	})
	rec := postSales(t, Finalize(config.Config{}), "/api/generate/video-sales/finalize-prompts", map[string]any{
		"customBaseUrl": server.URL, "customApiKey": "test", "category": "fashion",
		"shots":        []map[string]any{{"shotId": 1, "imageIndex": 0, "description": "展示", "voiceover": "看这件", "duration": 4}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/coat.jpg", "role": "main"}},
		"referenceOrder": []map[string]any{
			{"slot": "person", "label": "出镜人物", "url": "https://example.com/person.jpg"},
			{"slot": "garment", "label": "服饰单品", "url": "https://example.com/coat.jpg"},
			{"slot": "scene", "label": "场景", "url": ""},
		},
	})
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "绘图提示词") {
		t.Fatalf("expected still prompt rejection, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestFinalizeRequiresSceneImagePrompt(t *testing.T) {
	server := useChatServer(t, func(map[string]any, int) string {
		return `{"prompts":[{"shotId":1,"prompt":"保持白色包装"}]}`
	})
	rec := postSales(t, Finalize(config.Config{}), "/api/generate/video-sales/finalize-prompts", map[string]any{
		"customBaseUrl": server.URL, "customApiKey": "test",
		"shots":        []map[string]any{{"shotId": 1, "imageIndex": 0, "description": "人在客厅", "voiceover": "看这里", "duration": 4, "visualSource": "ai_generate"}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}},
	})
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "绘图提示词") {
		t.Fatalf("expected image prompt rejection, got %d %s", rec.Code, rec.Body.String())
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

func TestFinalizeRewritesPromptFromSelectedImage(t *testing.T) {
	var missedImage bool
	server := useChatServer(t, func(body map[string]any, _ int) string {
		encoded, _ := json.Marshal(body)
		if !strings.Contains(string(encoded), "https://example.com/a.jpg") || !strings.Contains(string(encoded), "实拍照片") {
			missedImage = true
		}
		return `{"prompts":[{"shotId":1,"prompt":"保持白色包装，镜头缓慢推近，不要字幕"}]}`
	})
	rec := postSales(t, Finalize(config.Config{}), "/api/generate/video-sales/finalize-prompts", map[string]any{
		"customBaseUrl": server.URL, "customApiKey": "test",
		"shots":        []map[string]any{{"shotId": 1, "imageIndex": 0, "description": "正面", "voiceover": "看这里", "camera": "推近", "duration": 4}},
		"imageCatalog": []map[string]any{{"index": 0, "url": "https://example.com/a.jpg", "role": "main"}},
	})
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "保持白色包装") {
		t.Fatalf("expected final prompt, got %d %s", rec.Code, rec.Body.String())
	}
	if missedImage {
		t.Fatal("finalize should see the selected image")
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
