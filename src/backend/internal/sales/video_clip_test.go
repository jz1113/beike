package sales

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/storage"
	"beike.local/cloud/src/backend/internal/system"
)

func TestVideoClipRejectsInvalidAndCrossWorkspaceSources(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	for _, body := range []string{
		`{`, `{"sourceUrl":"/storage/local/source.mp4","endSec":0}`,
		`{"sourceUrl":"/storage/local/source.mp4","endSec":601}`,
		`{"sourceUrl":"/storage/local/source.mp4","endSec":2,"maxDurationSec":1}`,
		`{"sourceUrl":"/storage/local/source.mp4","endSec":2,"maxDurationSec":601}`,
		`{"sourceUrl":"/storage/local/source.mp4","endSec":1,"speed":2}`,
		`{"sourceUrl":"https://example.com/ref.mp4","endSec":1}`,
		`{"sourceUrl":"/storage/tenant-b/source.mp4","endSec":1}`,
		`{"sourceUrl":"/storage/tenant-a/../tenant-b/source.mp4","endSec":1}`,
		`{"sourceUrl":"/storage/tenant-a/video.m3u8","endSec":1}`,
		`{"sourceUrl":"/storage/tenant-a/source.mp4","endSec":1} {}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/sales/video-clip", strings.NewReader(body))
		req = req.WithContext(httpx.WithWorkspace(req.Context(), "tenant-a"))
		res := httptest.NewRecorder()
		VideoClip(config.Config{}).ServeHTTP(res, req)
		if res.Code != 400 {
			t.Fatalf("invalid clip accepted: %s => %d %s", body, res.Code, res.Body.String())
		}
	}
}

func TestVideoClipRejectsSymlinkAliasesAndOversizedFiles(t *testing.T) {
	cache := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cache)
	if err := os.MkdirAll(filepath.Join(cache, "tenant-a"), 0o755); err != nil {
		t.Fatal(err)
	}
	external := filepath.Join(t.TempDir(), "private.mp4")
	if err := os.WriteFile(external, []byte("private"), 0o600); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(cache, "tenant-a", "alias.mp4")
	if err := os.Symlink(external, alias); err == nil {
		if _, err := localClipVideoFile("", "/storage/tenant-a/alias.mp4", "tenant-a"); err == nil {
			t.Fatal("symlink to a file outside storage must not be readable")
		}
	}
	large, err := os.Create(filepath.Join(cache, "tenant-a", "large.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	if err := large.Truncate(videoClipMaxBytes + 1); err != nil {
		t.Fatal(err)
	}
	_ = large.Close()
	if _, err := localClipVideoFile("", "/storage/tenant-a/large.mp4", "tenant-a"); err == nil {
		t.Fatal("large video accepted")
	}
}

func TestVideoClipKeepsOriginalSpeedAndSourceAndReusesDerivedPrefix(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	cache := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cache)
	if err := os.MkdirAll(filepath.Join(cache, "local"), 0o755); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(cache, "local", "depth-source.mp4")
	args := []string{"-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=2", "-f", "lavfi", "-i", "sine=frequency=800:duration=2",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source}
	if raw, err := exec.CommandContext(t.Context(), ffmpeg, args...).CombinedOutput(); err != nil {
		t.Fatalf("source: %v %s", err, raw)
	}
	original, _ := os.ReadFile(source)
	request := func(end float64) *httptest.ResponseRecorder {
		body, _ := json.Marshal(videoClipRequest{SourceURL: "/storage/local/depth-source.mp4", EndSec: end})
		res := httptest.NewRecorder()
		VideoClip(config.Config{Root: root}).ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/api/sales/video-clip", bytes.NewReader(body)))
		return res
	}
	res := request(1.2)
	var clipped struct {
		URL         string  `json:"url"`
		StartSec    float64 `json:"startSec"`
		EndSec      float64 `json:"endSec"`
		DurationSec float64 `json:"durationSec"`
	}
	_ = json.Unmarshal(res.Body.Bytes(), &clipped)
	if res.Code != 200 || clipped.StartSec != 0 || clipped.EndSec != 1.2 || clipped.DurationSec < 1.19 || clipped.DurationSec > 1.21 {
		t.Fatalf("clip: %d %s", res.Code, res.Body.String())
	}
	output := storage.StoredFile(strings.TrimPrefix(clipped.URL, "/storage/"))
	probe, err := system.ProbeLocalVideo(t.Context(), root, output)
	if err != nil || probe.HasAudio || probe.FPS != 25 || probe.Width != 320 || probe.Height != 240 {
		t.Fatalf("clip must keep video dimensions/fps and remove audio: %#v %v", probe, err)
	}
	// Identical time slices should have the same frame count. A duration-only
	// test would also pass a sped-up encoding of the entire source.
	frame := func(file string) []byte {
		t.Helper()
		raw, err := exec.CommandContext(t.Context(), ffmpeg, "-v", "error", "-ss", "0.8", "-i", file,
			"-frames:v", "1", "-vf", "scale=16:12,format=gray", "-f", "rawvideo", "pipe:1").Output()
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	a, b := frame(source), frame(output)
	if len(a) != len(b) || len(a) == 0 {
		t.Fatalf("frame sizes differ: %d / %d", len(a), len(b))
	}
	difference := 0
	for i := range a {
		delta := int(a[i]) - int(b[i])
		if delta < 0 {
			delta = -delta
		}
		difference += delta
	}
	if difference > len(a)*3 {
		t.Fatalf("motion at the same source timestamp changed: %d pixels, difference=%d", len(a), difference)
	}
	info, _ := os.Stat(output)
	if again := request(1.2); again.Code != 200 {
		t.Fatalf("cached clip: %d %s", again.Code, again.Body.String())
	}
	newInfo, _ := os.Stat(output)
	if !info.ModTime().Equal(newInfo.ModTime()) {
		t.Fatal("same prefix should reuse its cached derivative")
	}
	after, _ := os.ReadFile(source)
	if !bytes.Equal(original, after) {
		t.Fatal("original video changed")
	}
	if tooLong := request(2.5); tooLong.Code != 400 {
		t.Fatalf("end past source accepted: %d %s", tooLong.Code, tooLong.Body.String())
	}
	files, _ := filepath.Glob(filepath.Join(filepath.Dir(output), ".sales-clip-*"))
	if len(files) != 0 {
		t.Fatalf("temporary clips leaked: %v", files)
	}
}

func TestVideoClipFractionalFrameRateRespectsReferenceBudgetAndMinimum(t *testing.T) {
	root, _ := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	cache := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", cache)
	if err := os.MkdirAll(filepath.Join(cache, "local"), 0o755); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(cache, "local", "fractional.mp4")
	if raw, err := exec.CommandContext(t.Context(), ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:r=30000/1001:d=16",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", source).CombinedOutput(); err != nil {
		t.Fatalf("source: %v %s", err, raw)
	}
	for _, test := range []struct {
		name       string
		end        float64
		minimum    float64
		maximum    float64
		maxRequest bool
	}{
		{"maximum-reference-boundary", 15, 14.96, 15, true},
		{"seedance-minimum-boundary", 2, 2, 2.04, true},
		{"wan-minimum-boundary", 1, 1, 1.04, true},
		{"no-model-budget", 2, 2, 2.04, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := videoClipRequest{SourceURL: "/storage/local/fractional.mp4", EndSec: test.end}
			if test.maxRequest {
				maximum := 15.0
				body.MaxDurationSec = &maximum
			}
			raw, _ := json.Marshal(body)
			res := httptest.NewRecorder()
			VideoClip(config.Config{Root: root}).ServeHTTP(res, httptest.NewRequest(http.MethodPost, "/api/sales/video-clip", bytes.NewReader(raw)))
			var result struct {
				DurationSec float64 `json:"durationSec"`
			}
			_ = json.Unmarshal(res.Body.Bytes(), &result)
			if res.Code != 200 || result.DurationSec > test.maximum || result.DurationSec < test.minimum {
				t.Fatalf("fractional-frame-rate clip violates reference bounds: %d %s", res.Code, res.Body.String())
			}
		})
	}
}
