package system

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
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
