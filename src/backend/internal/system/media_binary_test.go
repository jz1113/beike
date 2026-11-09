package system

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/media"
)

func TestBundledMediaBinaryPlatformNames(t *testing.T) {
	for _, test := range []struct {
		name, goos, arch, platform, executable string
	}{
		{"ffmpeg", "darwin", "arm64", "darwin-arm64", "ffmpeg"},
		{"ffprobe", "darwin", "amd64", "darwin-x64", "ffprobe"},
		{"ffmpeg", "linux", "amd64", "linux-x64", "ffmpeg"},
		{"ffprobe", "linux", "arm64", "linux-arm64", "ffprobe"},
		{"ffmpeg", "windows", "amd64", "win32-x64", "ffmpeg.exe"},
		{"ffprobe", "windows", "386", "win32-ia32", "ffprobe.exe"},
	} {
		t.Run(test.name+"/"+test.platform, func(t *testing.T) {
			root := t.TempDir()
			want := filepath.Join(root, "node_modules", "@"+test.name+"-installer", test.platform, test.executable)
			writeMediaTestFile(t, want, "binary")
			if got := bundledBinaryForPlatform(root, test.name, test.goos, test.arch); got != want {
				t.Fatalf("got %q, want %q", got, want)
			}
		})
	}
}

func TestBundledMediaBinaryResolvesPnpmSymlinks(t *testing.T) {
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			scope := "@" + name + "-installer"
			store := filepath.Join(root, "node_modules", ".pnpm")
			packageDir := filepath.Join(store, name+"@1", "node_modules", scope, name)
			writeMediaTestFile(t, filepath.Join(packageDir, "package.json"), "{}")
			binaryDir := filepath.Join(store, name+"-platform@1", "node_modules", scope, "darwin-arm64")
			want := filepath.Join(binaryDir, name)
			writeMediaTestFile(t, want, "binary")
			rootScope := filepath.Join(root, "node_modules", scope)
			if err := os.MkdirAll(rootScope, 0o755); err != nil {
				t.Fatal(err)
			}
			linkMediaTestDir(t, packageDir, filepath.Join(rootScope, name))
			linkMediaTestDir(t, binaryDir, filepath.Join(filepath.Dir(packageDir), "darwin-arm64"))
			got := bundledBinaryForPlatform(root, name, "darwin", "arm64")
			resolved, err := filepath.EvalSymlinks(got)
			want, wantErr := filepath.EvalSymlinks(want)
			if err != nil || wantErr != nil || resolved != want {
				t.Fatalf("resolved %q (%v), want %q", resolved, err, want)
			}
		})
	}
}

func TestBundledMediaBinaryRejectsMissingAndDirectories(t *testing.T) {
	root := t.TempDir()
	if got := bundledBinaryForPlatform(root, "ffprobe", "linux", "amd64"); got != "" {
		t.Fatalf("missing binary: %q", got)
	}
	dir := filepath.Join(root, "node_modules", "@ffprobe-installer", "linux-x64", "ffprobe")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if got := bundledBinaryForPlatform(root, "ffprobe", "linux", "amd64"); got != "" {
		t.Fatalf("directory accepted as binary: %q", got)
	}
}

func TestMediaBinaryFallsBackToSystemAfterBrokenBundle(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test executables use POSIX shell")
	}
	root, binDir := t.TempDir(), t.TempDir()
	arch := runtime.GOARCH
	if arch == "amd64" {
		arch = "x64"
	}
	writeMediaTestFile(t, filepath.Join(root, "node_modules", "@ffmpeg-installer", runtime.GOOS+"-"+arch, "ffmpeg"), "#!/bin/sh\nexit 1\n")
	want := filepath.Join(binDir, "ffmpeg")
	writeMediaTestFile(t, want, "#!/bin/sh\nexit 0\n")
	t.Setenv("PATH", binDir)
	if got, ok := binaryReady(root, "ffmpeg"); !ok || got != want {
		t.Fatalf("got %q, %v; want %q, true", got, ok, want)
	}
}

func TestInstalledMediaToolsEncodeAndProbe(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if _, err := os.Stat(filepath.Join(root, "node_modules", "@"+name+"-installer", name)); err != nil {
			t.Skip("media packages are not installed; run pnpm install to test actual binaries")
		}
	}
	ffmpeg, ok := FFmpegBinary(root)
	if !ok {
		t.Fatal("installed FFmpeg is not executable")
	}
	output := filepath.Join(t.TempDir(), "smoke.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=red:s=320x240:r=25:d=0.2", "-c:v", "libx264", output)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("encode: %v\n%s", err, out)
	}
	probe, err := ProbeVideo(root, output)
	if err != nil || probe.Width != 320 || probe.Height != 240 || probe.Duration <= 0 || probe.FPS != 25 {
		t.Fatalf("probe %+v: %v", probe, err)
	}
}

func TestAudioProbeUsesAudioDurationAndRejectsMissingStreams(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want float64
	}{
		{`{"streams":[{"codec_type":"audio","duration":"2.5"}],"format":{"duration":"8"}}`, 2.5},
		{`{"streams":[{"codec_type":"audio","duration":"N/A"}],"format":{"duration":"8"}}`, 8},
		{`{"streams":[],"format":{"duration":"8"}}`, 0},
		{`{"streams":[{"codec_type":"video"}],"format":{"duration":"8"}}`, 0},
		{`{"streams":[{"codec_type":"audio","duration":"NaN"}]}`, 0},
		{`{"streams":[{"codec_type":"audio"}],"format":{"duration":"+Inf"}}`, 0},
	} {
		got, err := parseAudioDuration([]byte(test.raw))
		if (err != nil) != (test.want == 0) || got != test.want {
			t.Errorf("probe %s: got %v, %v", test.raw, got, err)
		}
	}
}

func TestParseProbeReadsVideoStream(t *testing.T) {
	probe, err := parseProbe([]byte(`{"streams":[{"codec_type":"audio"},{"codec_type":"video","width":1920,"height":1080,"avg_frame_rate":"30000/1001"}],"format":{"duration":"1.5"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if probe.Width != 1920 || probe.Height != 1080 || probe.Duration != 1.5 || !probe.HasAudio || probe.FPS < 29 || probe.FPS > 30 {
		t.Fatalf("probe %+v", probe)
	}
	silent, err := parseProbe([]byte(`{"streams":[{"codec_type":"video","width":720,"height":1280,"avg_frame_rate":"24/1"}],"format":{"duration":"4"}}`))
	if err != nil || silent.HasAudio {
		t.Fatalf("silent probe %+v %v", silent, err)
	}
	if _, err := parseProbe([]byte(`{"streams":[{"codec_type":"audio"}]}`)); err == nil || err.Error() != "未在视频中找到视频流" {
		t.Fatalf("missing video %v", err)
	}
}

func TestMediaReviewListsWorkspaceFiles(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_DATA_DIR", root)
	dir := filepath.Join(root, "media-review", "local")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	body := []byte(`{"url":"https://cdn.example.com/a.png","source":{"assetType":"scene","ids":["1"]},"state":"retained-reference-check-required","queuedAt":"2026-01-02T00:00:00.000Z"}`)
	if err := os.WriteFile(filepath.Join(dir, "a.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	mediaReviewHandler(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/system/media-review", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status %d", response.Code)
	}
	var payload struct {
		Count int `json:"count"`
		Items []struct {
			URL string `json:"url"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Count != 1 || payload.Items[0].URL != "https://cdn.example.com/a.png" {
		t.Fatalf("payload %#v", payload)
	}
}

func TestMemoryCleanupReportsWAL(t *testing.T) {
	proxyCache.Store("cleanup-test", media.ProxyCacheEntry{Body: []byte("image")})
	handler := memoryCleanupHandler(config.Config{})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/system/memory-cleanup", nil))
	if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(`"gcRun":false`)) || bytes.Contains(response.Body.Bytes(), []byte("WAL 已清理")) || bytes.Contains(response.Body.Bytes(), []byte("当前 RSS")) {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
	var body struct {
		CacheCleared media.ProxyCacheStats
		Cache        media.ProxyCacheStats
		WALResult    any
		After        map[string]uint64
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.CacheCleared.Bytes < 5 || body.Cache.Bytes != 0 || body.WALResult != nil || body.After["runtimeSys"] == 0 {
		t.Fatalf("incorrect cleanup result %+v", body)
	}
}

func TestMemoryCleanupRequiresAdminInProduction(t *testing.T) {
	handler := memoryCleanupHandler(config.Config{NodeEnv: "production", AccessToken: "user", AdminToken: "admin"})
	req := httptest.NewRequest(http.MethodPost, "/api/system/memory-cleanup", nil)
	req.Header.Set("x-app-token", "user")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func writeMediaTestFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o755); err != nil {
		t.Fatal(err)
	}
}

func linkMediaTestDir(t *testing.T, target, link string) {
	t.Helper()
	err := os.Symlink(target, link)
	if err != nil && runtime.GOOS == "windows" {
		t.Skipf("directory symlinks unavailable: %v", err)
	}
	if err != nil {
		t.Fatal(err)
	}
}
