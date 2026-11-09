package depth

import (
	"bytes"
	"context"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/system"
)

func TestDepthVideoResolutionPreservesOrientationAndFrameCount(t *testing.T) {
	ffmpeg, ok := system.FFmpegBinary("")
	if !ok {
		t.Skip("FFmpeg unavailable")
	}
	for _, tc := range []struct {
		resolution string
		sourceSize string
		width      int
		height     int
	}{
		{"480p", "180x320", 480, 854},
		{"720p", "320x180", 1280, 720},
	} {
		t.Run(tc.resolution, func(t *testing.T) {
			dir := t.TempDir()
			source, frames, output := filepath.Join(dir, "source.mp4"), filepath.Join(dir, "frames"), filepath.Join(dir, "depth.mp4")
			if data, err := exec.Command(ffmpeg, "-v", "error", "-f", "lavfi", "-i", "testsrc2=size="+tc.sourceSize+":rate=8:duration=0.5", "-c:v", "libx264", source).CombinedOutput(); err != nil {
				t.Fatalf("create fixture: %v: %s", err, data)
			}
			count, fps, err := extractDepthFrames("", source, frames, 960, tc.resolution, 8)
			if err != nil || count != 4 || fps != 8 {
				t.Fatalf("extract: count=%d fps=%g err=%v", count, fps, err)
			}
			if err := encodeDepthFrames("", frames, output, fps, 21, "veryfast"); err != nil {
				t.Fatal(err)
			}
			probe, err := system.ProbeLocalVideo(context.Background(), "", output)
			if err != nil || probe.Width != tc.width || probe.Height != tc.height || probe.Duration != 0.5 {
				t.Fatalf("probe: %+v err=%v", probe, err)
			}
		})
	}
}

func TestDepthVideoPollMissingRecord(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "depth.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE ImageTask (
		id TEXT, workspaceId TEXT, taskId TEXT, status TEXT, resultUrl TEXT, failReason TEXT, quality TEXT, createdAt TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO ImageTask VALUES ('row-1','local','depth-live','IN_PROGRESS',NULL,NULL,'standard','2099-01-01T00:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := DepthVideo(config.Config{DatabaseURL: "file:" + dbPath})
	missingID := httptest.NewRecorder()
	handler.ServeHTTP(missingID, httptest.NewRequest(http.MethodGet, "/api/generate/depth-video", nil))
	if missingID.Code != http.StatusBadRequest || !strings.Contains(missingID.Body.String(), "缺少 taskId 参数") {
		t.Fatalf("missing id %d %s", missingID.Code, missingID.Body.String())
	}
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodGet, "/api/generate/depth-video?taskId=gone", nil))
	if unknown.Code != http.StatusNotFound || !strings.Contains(unknown.Body.String(), "任务不存在") {
		t.Fatalf("unknown %d %s", unknown.Code, unknown.Body.String())
	}
	live := httptest.NewRecorder()
	handler.ServeHTTP(live, httptest.NewRequest(http.MethodGet, "/api/generate/depth-video?taskId=depth-live", nil))
	if live.Code != http.StatusOK || !strings.Contains(live.Body.String(), `"status":"IN_PROGRESS"`) {
		t.Fatalf("live %d %s", live.Code, live.Body.String())
	}
}

func TestDepthVideoSubmitValidatesJSON(t *testing.T) {
	cfg := config.Config{}
	empty := httptest.NewRecorder()
	depthVideoSubmit(cfg, empty, httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", strings.NewReader(`{}`)))
	if empty.Code != http.StatusBadRequest || !strings.Contains(empty.Body.String(), "请提供 videoDataUrl 或 videoUrl") {
		t.Fatalf("empty %d %s", empty.Code, empty.Body.String())
	}
	style := httptest.NewRecorder()
	depthVideoSubmit(cfg, style, httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", strings.NewReader(`{"videoUrl":"https://example.com/a.mp4","style":"nope"}`)))
	if style.Code != http.StatusBadRequest || !strings.Contains(style.Body.String(), "Invalid enum value") {
		t.Fatalf("style %d %s", style.Code, style.Body.String())
	}
	broken := httptest.NewRecorder()
	depthVideoSubmit(cfg, broken, httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", strings.NewReader(`{`)))
	if broken.Code != http.StatusInternalServerError || !strings.Contains(broken.Body.String(), "请求数据格式异常") || !strings.Contains(broken.Body.String(), "submissionRejected") {
		t.Fatalf("broken %d %s", broken.Code, broken.Body.String())
	}
	tooBig := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", nil)
	request.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	request.Header.Set("Content-Length", "40000000")
	depthVideoSubmit(cfg, tooBig, request)
	if tooBig.Code != http.StatusBadRequest || !strings.Contains(tooBig.Body.String(), "视频过大，请控制在 35MB 以内") {
		t.Fatalf("size %d %s", tooBig.Code, tooBig.Body.String())
	}
}

func TestDepthVideoFormChecksFile(t *testing.T) {
	cfg := config.Config{}
	missing := httptest.NewRecorder()
	depthVideoSubmit(cfg, missing, depthVideoRequest(t, "note", "a.txt", "text/plain", []byte("hello")))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "缺少视频文件 video") {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
	kind := httptest.NewRecorder()
	depthVideoSubmit(cfg, kind, depthVideoRequest(t, "video", "notes.txt", "text/plain", []byte("hello")))
	if kind.Code != http.StatusBadRequest || !strings.Contains(kind.Body.String(), "请上传 MP4 / WebM / MOV 视频文件") {
		t.Fatalf("kind %d %s", kind.Code, kind.Body.String())
	}
	accepted := httptest.NewRecorder()
	depthVideoSubmit(cfg, accepted, depthVideoRequest(t, "video", "clip.mp4", "application/octet-stream", []byte("mp4")))
	if accepted.Code == http.StatusBadRequest {
		t.Fatalf("mp4 was rejected: %s", accepted.Body.String())
	}
}

func depthVideoRequest(t *testing.T, field, name, contentType string, payload []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="` + field + `"; filename="` + name + `"`},
		"Content-Type":        {contentType},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestDepthVideoRejectsMissingFFmpeg(t *testing.T) {
	handler := DepthVideo(config.Config{Root: t.TempDir()})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}

func TestConcurrentDepthWaitersShareOneReceipt(t *testing.T) {
	cfg := config.Config{DatabaseURL: "file:" + filepath.Join(t.TempDir(), "depth.db")}
	entered := make(chan struct{})
	release := make(chan struct{})
	results := make(chan string, 4)
	var calls atomic.Int32
	run := func() {
		req := httptest.NewRequest("POST", "/", nil)
		code, body := guardDepth(cfg, req, "depth-video", "shared", "same-input", func() (int, map[string]any) {
			if calls.Add(1) == 1 {
				close(entered)
			}
			<-release
			return 200, map[string]any{"taskId": "one"}
		})
		results <- fmt.Sprint(code, body["taskId"])
	}
	go run()
	<-entered
	for range 3 {
		go run()
	}
	time.Sleep(20 * time.Millisecond)
	close(release)
	for range 4 {
		select {
		case result := <-results:
			if result != "200one" {
				t.Fatal(result)
			}
		case <-time.After(time.Second):
			t.Fatal("waiter did not receive the original receipt")
		}
	}
	if calls.Load() != 1 {
		t.Fatal(calls.Load())
	}
}

func TestP1DepthRecoveryDistinguishesPendingMissingAndUnreadable(t *testing.T) {
	t.Setenv("AZHUO_DATA_DIR", t.TempDir())
	cfg := config.Config{DatabaseURL: "file:" + filepath.Join(t.TempDir(), "db")}
	for _, kind := range []string{"depth-image", "depth-video"} {
		r := httptest.NewRequest("GET", "/?taskKey=original", nil)
		file, err := depthReceiptFile(cfg, "local", depthReceiptKey("local", kind, "original"))
		if err != nil {
			t.Fatal(err)
		}
		status, body := readDepthSubmission(cfg, r, kind)
		if status != 200 || body["operationNotFound"] != true {
			t.Fatal(status, body)
		}
		if err = writeDepthReceiptExclusive(file, depthReceipt{Kind: kind, Fingerprint: "input"}); err != nil {
			t.Fatal(err)
		}
		for range 10 {
			status, body = readDepthSubmission(cfg, r, kind)
			if status != 200 || body["submissionPending"] == true || body["submissionUnknown"] != true {
				t.Fatal(status, body)
			}
		}
		if err = os.WriteFile(file, []byte("interrupted write"), 0600); err != nil {
			t.Fatal(err)
		}
		status, body = readDepthSubmission(cfg, r, kind)
		if status != 503 || body["submissionUnknown"] != true || body["operationNotFound"] == true {
			t.Fatal(status, body)
		}
		if err = writeDepthReceipt(file, depthReceipt{Kind: kind, Status: 200, Body: `{"success":true,"resultUrl":"/original.png"}`}); err != nil {
			t.Fatal(err)
		}
		status, body = readDepthSubmission(cfg, r, kind)
		if status != 200 || body["resultUrl"] != "/original.png" {
			t.Fatal(status, body)
		}
	}
}

func TestDepthVideoProbeDoesNotRejectAfterAccept(t *testing.T) {
	status, message := depthVideoProbeHTTP(system.VideoProbe{Duration: 31, Width: 1920, Height: 1080})
	if status != 0 || message != "" {
		t.Fatalf("submit status %d %s", status, message)
	}
}
