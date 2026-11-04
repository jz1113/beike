package sales

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/system"
)

func TestVideoReviewDecodesActualPictureAndAudio(t *testing.T) {
	root, _ := filepath.Abs("../../../..")
	ffmpeg, ok := system.FFmpegBinary(root)
	if !ok {
		t.Skip("FFmpeg is not installed")
	}
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "local"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AZHUO_CACHE_DIR", dir)
	handler := VideoReview(config.Config{Root: root})
	for _, tc := range []struct{ color, source, picture, audio string }{
		{"white", "sine=frequency=440", "visible", "audible"},
		{"black", "anullsrc", "dark", "quiet"},
		{"white", "", "visible", "missing"},
	} {
		t.Run(tc.audio, func(t *testing.T) {
			rel := "local/review-" + tc.audio + ".mp4"
			path := filepath.Join(dir, rel)
			args := []string{"-v", "error", "-f", "lavfi", "-i", "color=c=" + tc.color + ":s=64x96"}
			if tc.source != "" {
				args = append(args, "-f", "lavfi", "-i", tc.source)
			}
			args = append(args, "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", path)
			if out, err := exec.Command(ffmpeg, args...).CombinedOutput(); err != nil {
				t.Fatalf("%v: %s", err, out)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest("POST", "/api/sales/video-review", strings.NewReader(fmt.Sprintf(`{"videoUrl":"/storage/%s"}`, rel))))
			var data struct {
				Picture, Audio string
				Width, Height  int
				DurationSec    float64
			}
			if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &data) != nil || data.Picture != tc.picture || data.Audio != tc.audio || data.Width != 64 || data.Height != 96 || data.DurationSec < 1 {
				t.Fatal(rec.Code, rec.Body.String())
			}
		})
	}
}
