package system

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/mediasign"
)

func TestLocalVideoDownloadUsesPickerGrantAndCompletes(t *testing.T) {
	dir := t.TempDir()
	token, err := grantVideoDirectory("local", dir)
	if err != nil {
		t.Fatal(err)
	}
	previous := videoFileSaver
	done := make(chan string, 1)
	videoFileSaver = func(_ context.Context, _ config.Config, root, name, _ string) error {
		done <- root + "/" + name
		return nil
	}
	t.Cleanup(func() { videoFileSaver = previous })
	body, _ := json.Marshal(map[string]any{"directory": dir, "directoryToken": token, "concurrency": 100, "items": []map[string]string{{"filename": "test.mp4", "url": "https://xceshi.oss-cn-beijing.aliyuncs.com/a.mp4"}}})
	cfg := config.Config{AccessToken: "test-only", Root: repoRoot(t)}
	r := httptest.NewRequest(http.MethodPost, "/api/system/video-downloads", strings.NewReader(string(body)))
	r.Header.Set("x-app-token", "test-only")
	w := httptest.NewRecorder()
	StartVideoDownload(cfg).ServeHTTP(w, r)
	var response struct {
		JobID string `json:"jobId"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil || w.Code != http.StatusOK || response.JobID == "" {
		t.Fatalf("start: %d %s %v", w.Code, w.Body.String(), err)
	}
	job, ok := lookupVideoDownloadJob(response.JobID)
	if !ok || job.owner != "local" {
		t.Fatal("missing owned job")
	}
	t.Cleanup(func() { videoDownloadJobs.Lock(); delete(videoDownloadJobs.items, job.id); videoDownloadJobs.Unlock() })
	select {
	case saved := <-done:
		canonical, _ := cleanVideoDirectory(dir)
		if saved != canonical+"/test.mp4" {
			t.Fatalf("unexpected destination %s", saved)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("download did not start")
	}
	deadline := time.Now().Add(2 * time.Second)
	for job.snapshot().Running && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if snapshot := job.snapshot(); snapshot.Running || snapshot.Items[0].Status != "success" {
		t.Fatalf("unfinished job %+v", snapshot)
	}
}

func TestVideoDownloadRejectsReadOnlyMediaSignature(t *testing.T) {
	cfg := config.Config{NodeEnv: "production", AccessToken: "test-only"}
	signature := mediasign.Create("proxy-media-session", cfg.AccessToken, 3600)
	r := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/system/video-downloads?exp=%d&sig=%s", signature.Exp, signature.Sig), strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	StartVideoDownload(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("read signature authorized writes: %d %s", w.Code, w.Body.String())
	}
}

func TestHostedVideoDownloadCannotWriteServerDirectory(t *testing.T) {
	cfg := config.Config{NodeEnv: "production", AccessToken: "test-only"}
	r := httptest.NewRequest(http.MethodPost, "/api/system/video-downloads", strings.NewReader(`{}`))
	r.Header.Set("x-app-token", "test-only")
	r.Header.Set("x-workspace-token", strings.Repeat("a", 32))
	w := httptest.NewRecorder()
	StartVideoDownload(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("hosted directory write: %d %s", w.Code, w.Body.String())
	}
}

func TestVideoDownloadJobRequiresWorkspaceOwner(t *testing.T) {
	cfg := config.Config{NodeEnv: "production", AccessToken: "test-only"}
	job := newVideoDownloadJob(t.TempDir(), 100, nil)
	storeVideoDownloadJob(job)
	defer func() { videoDownloadJobs.Lock(); delete(videoDownloadJobs.items, job.id); videoDownloadJobs.Unlock() }()
	for _, handler := range []http.Handler{VideoDownloadStatus(cfg), CancelVideoDownload(cfg)} {
		r := httptest.NewRequest(http.MethodGet, "/api/system/video-downloads/"+job.id, nil)
		r.SetPathValue("jobId", job.id)
		r.Header.Set("x-app-token", "test-only")
		r.Header.Set("x-workspace-token", strings.Repeat("b", 32))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("other workspace: %d %s", w.Code, w.Body.String())
		}
	}
}

func TestLocalVideoDirectoryRequiresPickerGrant(t *testing.T) {
	cfg := config.Config{AccessToken: "test-only", Root: repoRoot(t)}
	body, _ := json.Marshal(map[string]any{"directory": t.TempDir(), "concurrency": 100, "items": []map[string]string{{"filename": "test.mp4", "url": "https://xceshi.oss-cn-beijing.aliyuncs.com/a.mp4"}}})
	r := httptest.NewRequest(http.MethodPost, "/api/system/video-downloads", strings.NewReader(string(body)))
	r.Header.Set("x-app-token", "test-only")
	w := httptest.NewRecorder()
	StartVideoDownload(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "重新选择") {
		t.Fatalf("ungranted root: %d %s", w.Code, w.Body.String())
	}
}
