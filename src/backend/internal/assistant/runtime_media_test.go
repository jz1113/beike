package assistant

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

func TestVideoStoryboardCoversFullDurationAndKeepsFrames(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	binary, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("ffmpeg unavailable")
	}
	dir := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", dir)
	path := filepath.Join(dir, "local", "assistant-attachments", "source.mp4")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(binary, "-y", "-f", "lavfi", "-i", "color=c=red:s=64x48:d=2:r=10", "-f", "lavfi", "-i", "color=c=blue:s=64x48:d=2:r=10", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "mpeg4", path)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create video: %v %s", err, output)
	}
	box := &toolBox{ctx: context.Background(), cfg: config.Config{Root: root}, workspace: "local"}
	var result struct {
		Success bool      `json:"success"`
		URLs    []string  `json:"frameUrls"`
		Images  []string  `json:"_visualImages"`
		Times   []float64 `json:"sampleTimes"`
	}
	output := box.extractStoryboard(map[string]any{"video_url": "/storage/local/assistant-attachments/source.mp4", "sample_count": 4})
	if err := json.Unmarshal([]byte(output), &result); err != nil || !result.Success || len(result.Images) != 4 || len(result.Times) != 4 || result.Times[3] < 3 {
		t.Fatalf("storyboard: %v %s", err, output)
	}
	for i, data := range []string{result.Images[0], result.Images[3]} {
		raw, err := base64.StdEncoding.DecodeString(strings.SplitN(data, ",", 2)[1])
		if err != nil {
			t.Fatal(err)
		}
		frame, err := jpeg.Decode(strings.NewReader(string(raw)))
		if err != nil {
			t.Fatal(err)
		}
		r, _, b, _ := frame.At(20, 20).RGBA()
		if (i == 0 && r <= b) || (i == 1 && b <= r) {
			t.Fatalf("sample %d did not cover expected red/blue scene: %d %d", i, r, b)
		}
	}
	if follow := visualFollowup(output); follow == nil {
		t.Fatal("extracted frames must be sent to the model as images")
	}
	t.Run("non-video protocol receives prepared frames in its first request", func(t *testing.T) {
		payload := map[string]json.RawMessage{"messages": json.RawMessage(`[{"role":"user","content":"分析视频","attachments":[{"type":"video","url":"/storage/local/assistant-attachments/source.mp4"}]}]`)}
		messages := []map[string]any{{"role": "user", "content": "分析视频"}}
		hasVideo, err := prepareVideoInput(context.Background(), config.Config{Root: root}, "local", "gpt-6.1-sol", gatewayCreds{protocol: "openai"}, payload, messages)
		if err != nil || !hasVideo {
			t.Fatalf("prepare direct vision: %v", err)
		}
		parts, _ := messages[0]["content"].([]any)
		images := 0
		for _, part := range parts {
			p, _ := part.(map[string]any)
			if p["type"] == "image_url" {
				images++
			}
			if p["type"] == "video_url" {
				t.Fatal("a non-video protocol must receive images")
			}
		}
		if images != 24 {
			t.Fatalf("expected full-video image context, got %d images", images)
		}
	})
	t.Run("Gemini receives actual frames after the signed tool call", func(t *testing.T) {
		calls := 0
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			calls++
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			w.Header().Set("Content-Type", "text/event-stream")
			if calls == 1 {
				fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"name\":\"extract_video_storyboard\",\"args\":{\"video_url\":\"/storage/local/assistant-attachments/source.mp4\"}},\"thoughtSignature\":\"video-signature\"}]},\"finishReason\":\"STOP\"}]}\n\n")
				return
			}
			encoded, _ := json.Marshal(body)
			if strings.Count(string(encoded), `"inlineData"`) != 4 || !strings.Contains(string(encoded), "video-signature") || !strings.Contains(string(encoded), "sampleTimes") {
				t.Error("Gemini lost frame images, sampling times or tool signature")
			}
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"先红色场景，再蓝色场景。\"}]},\"finishReason\":\"STOP\"}]}\n\n")
		}))
		defer upstream.Close()
		loop := testLoop(upstream.URL, func(map[string]any) {})
		loop.models = []string{"gemini-3.8-flash"}
		loop.creds.protocol = "gemini"
		loop.results = &resultStore{}
		first, err := loop.complete(false, true)
		if err != nil || len(first.toolCalls) != 1 {
			t.Fatalf("video tool request: %v", err)
		}
		loop.pushToolMessage(first)
		loop.recordTool(first.toolCalls[0], output)
		loop.flushToolNotes()
		last, err := loop.complete(true, false)
		if err != nil || calls != 2 || last.content != "先红色场景，再蓝色场景。" {
			t.Fatalf("video reply: %v requests=%d content=%s", err, calls, last.content)
		}
	})
	var next map[string]any
	_ = json.Unmarshal([]byte(box.extractDetailedFrames(map[string]any{"video_url": "/storage/local/assistant-attachments/source.mp4", "start_time": 2, "end_time": 4, "frame_count": 2})), &next)
	urls, _ := next["frameUrls"].([]any)
	if next["success"] != true || len(urls) != 2 || urls[0] == result.URLs[0] {
		t.Fatalf("extraction must preserve previous frames: %#v", next)
	}
	bad := box.extractDetailedFrames(map[string]any{"video_url": "/storage/local/assistant-attachments/source.mp4", "start_time": 10, "end_time": 11})
	if !strings.Contains(bad, `"success":false`) {
		t.Fatalf("out-of-range extraction: %s", bad)
	}
}
