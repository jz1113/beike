package system

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestVideoDownloadNeverReplacesExistingFileOrSymlink(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "existing.mp4")
	if err := os.WriteFile(dest, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeVideoDownload(context.Background(), dir, dest, strings.NewReader("new")); err == nil {
		t.Fatal("overwrote existing file")
	}
	data, err := os.ReadFile(dest)
	if err != nil || string(data) != "keep" {
		t.Fatalf("existing file changed: %s %v", data, err)
	}
	outside := filepath.Join(t.TempDir(), "outside.mp4")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "link.mp4")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := writeVideoDownload(context.Background(), dir, link, strings.NewReader("replace")); err == nil {
		t.Fatal("replaced destination symlink")
	}
	data, err = os.ReadFile(outside)
	if err != nil || string(data) != "outside" {
		t.Fatalf("outside changed: %s %v", data, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 2 {
		t.Fatalf("temporary file remained: %v %v", entries, err)
	}
}

func TestVideoDownloadWritesUniquePartialAndHonorsCancellation(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "video.mp4")
	if err := os.WriteFile(dest+".part", []byte("unrelated"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeVideoDownload(context.Background(), dir, dest, strings.NewReader("video")); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(dest + ".part")
	if string(data) != "unrelated" {
		t.Fatal("truncated another partial file")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cancelled := filepath.Join(dir, "cancelled.mp4")
	if err := writeVideoDownload(ctx, dir, cancelled, strings.NewReader("video")); err != context.Canceled {
		t.Fatalf("cancelled write: %v", err)
	}
	if _, err := os.Stat(cancelled); !os.IsNotExist(err) {
		t.Fatal("cancelled result published")
	}
}

func TestVideoPickerReturnsScopedRootGrantAndHostedBrowserMode(t *testing.T) {
	dir := t.TempDir()
	previous := selectVideoDirectory
	selectVideoDirectory = func(context.Context) (string, error) { return dir, nil }
	t.Cleanup(func() { selectVideoDirectory = previous })
	cfg := config.Config{AccessToken: "test-only"}
	r := httptest.NewRequest(http.MethodPost, "/api/system/video-downloads/pick-directory", nil)
	r.Header.Set("x-app-token", "test-only")
	w := httptest.NewRecorder()
	PickVideoDirectory(cfg).ServeHTTP(w, r)
	var body struct{ Directory, DirectoryToken, Mode string }
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	canonical, err := cleanVideoDirectory(dir)
	if err != nil || body.Mode != "local" || !hasVideoDirectoryGrant("local", canonical, body.DirectoryToken) {
		t.Fatalf("picker grant: %s %v", w.Body.String(), err)
	}
	if hasVideoDirectoryGrant("other", canonical, body.DirectoryToken) || hasVideoDirectoryGrant("local", t.TempDir(), body.DirectoryToken) {
		t.Fatal("grant crossed owner/root")
	}
	selectVideoDirectory = func(context.Context) (string, error) { t.Error("hosted mode opened native picker"); return "", nil }
	cfg.NodeEnv = "production"
	r.Header.Set("x-workspace-token", strings.Repeat("a", 32))
	w = httptest.NewRecorder()
	PickVideoDirectory(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"mode":"browser"`) || strings.Contains(w.Body.String(), "directory") {
		t.Fatalf("hosted picker: %d %s", w.Code, w.Body.String())
	}
}
