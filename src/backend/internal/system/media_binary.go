package system

import (
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func binaryReady(root, name string) (string, bool) {
	candidates := []string{}
	if bundled := bundledBinary(root, name); bundled != "" {
		candidates = append(candidates, bundled)
	}
	if system, err := exec.LookPath(name); err == nil {
		candidates = append(candidates, system)
	}
	for _, candidate := range candidates {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cmd := exec.CommandContext(ctx, candidate, "-version")
		cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
		err := cmd.Run()
		cancel()
		if err == nil {
			return candidate, true
		}
	}
	return name, false
}

func bundledBinary(root, name string) string {
	return bundledBinaryForPlatform(root, name, runtime.GOOS, runtime.GOARCH)
}

// Resolve the installer's real package directory before locating its platform
// dependency. pnpm keeps that dependency beside the package in its virtual store.
func bundledBinaryForPlatform(root, name, goos, goarch string) string {
	if name != "ffmpeg" && name != "ffprobe" {
		return ""
	}
	platform, arch, executable := goos, goarch, name
	if goos == "windows" {
		platform, executable = "win32", name+".exe"
	}
	switch goarch {
	case "amd64":
		arch = "x64"
	case "386":
		arch = "ia32"
	}
	scope := "@" + name + "-installer"
	packageDir := filepath.Join(root, "node_modules", scope, name)
	if resolved, err := filepath.EvalSymlinks(packageDir); err == nil {
		candidate := filepath.Join(filepath.Dir(resolved), platform+"-"+arch, executable)
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
			return candidate
		}
	}
	// Also accept flat installations with a platform package at the root.
	candidate := filepath.Join(root, "node_modules", scope, platform+"-"+arch, executable)
	if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
		return candidate
	}
	return ""
}
