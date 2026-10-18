package system

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

func TestSafeVideoDestinationStaysInsideDirectory(t *testing.T) {
	dir := t.TempDir()
	dest, err := safeVideoDestination(dir, "孩子早上自己主动要喝.mp4")
	if err != nil || dest != filepath.Join(dir, "孩子早上自己主动要喝.mp4") {
		t.Fatalf("dest %s %v", dest, err)
	}
	if _, err = safeVideoDestination(dir, `..\secret.mp4`); err == nil {
		t.Fatal("accepted parent path")
	}
	if _, err = safeVideoDestination(dir, "con.mp4"); err == nil {
		t.Fatal("accepted reserved name")
	}
}

func TestSafeVideoDestinationByteLimit(t *testing.T) {
	dir := t.TempDir()
	allowed := strings.Repeat("视", 78) + ".mp4"
	dest, err := safeVideoDestination(dir, allowed)
	if err != nil || dest != filepath.Join(dir, allowed) {
		t.Fatalf("dest %s %v", dest, err)
	}
	if _, err = safeVideoDestination(dir, strings.Repeat("视", 80)+".mp4"); err == nil {
		t.Fatal("accepted overlong name")
	}
}

func TestVideoConcurrencyTiers(t *testing.T) {
	if value, ok := videoConcurrency(0); !ok || value != 100 {
		t.Fatalf("default %d %v", value, ok)
	}
	if value, ok := videoConcurrency(100); !ok || value != 100 {
		t.Fatalf("tier %d %v", value, ok)
	}
	if _, ok := videoConcurrency(20); ok {
		t.Fatal("accepted 20")
	}
}

func TestStartVideoDownloadRejectsUnknownTier(t *testing.T) {
	cfg := config.Config{AccessToken: "secret", Root: repoRoot(t)}
	request := httptest.NewRequest(http.MethodPost, "/api/system/video-downloads", strings.NewReader(`{"directory":"`+strings.ReplaceAll(t.TempDir(), `\`, `\\`)+`","concurrency":20,"items":[{"filename":"a.mp4","url":"https://example.com/a.mp4"}]}`))
	request.Header.Set("x-app-token", "secret")
	response := httptest.NewRecorder()
	StartVideoDownload(cfg).ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "并发") {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestVideoJobCancelReturnsPending(t *testing.T) {
	previous := videoFileSaver
	t.Cleanup(func() { videoFileSaver = previous })
	entered := make(chan struct{})
	videoFileSaver = func(ctx context.Context, _ config.Config, _, _, _ string) error {
		close(entered)
		<-ctx.Done()
		return ctx.Err()
	}
	job := newVideoDownloadJob(t.TempDir(), 20, []videoDownloadItem{{Filename: "a.mp4", URL: "https://example.com/a.mp4", Status: "pending"}})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		job.run(ctx, config.Config{})
		close(done)
	}()
	<-entered
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("job did not stop")
	}
	snap := job.snapshot()
	if snap.Running || snap.Items[0].Status != "pending" {
		t.Fatalf("snapshot %+v", snap)
	}
}

func TestVideoDownloadFailure(t *testing.T) {
	noSuchKey := []byte(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>`)
	accessDenied := []byte(`<Error><Code>AccessDenied</Code><Message>AccessDenied</Message></Error>`)
	cases := []struct {
		status int
		length int64
		body   []byte
		want   string
	}{
		{http.StatusNotFound, 452, noSuchKey, "OSS 上没有这个文件"},
		{http.StatusNotFound, 0, nil, "OSS 上没有这个文件"},
		{http.StatusForbidden, 120, accessDenied, "没有下载权限"},
		{http.StatusForbidden, 0, nil, "没有下载权限"},
		{http.StatusTooManyRequests, 0, nil, "对方繁忙，请稍后重试"},
		{http.StatusServiceUnavailable, 20, nil, "对方繁忙，请稍后重试"},
		{http.StatusOK, 0, nil, "视频内容为空"},
		{http.StatusOK, -1, nil, ""},
		{http.StatusBadGateway, 10, []byte("upstream"), "视频下载失败"},
	}
	for _, tc := range cases {
		if got := videoDownloadFailure(tc.status, tc.length, tc.body); got != tc.want {
			t.Fatalf("status %d length %d got %q want %q", tc.status, tc.length, got, tc.want)
		}
	}
}
