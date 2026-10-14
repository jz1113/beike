package depth

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

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
	handler := DepthVideo(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + dbPath})
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
	cfg := config.Config{Upstream: "http://127.0.0.1:1"}
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
	cfg := config.Config{Upstream: "http://127.0.0.1:1"}
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
	handler := DepthVideo(config.Config{Root: t.TempDir(), Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/depth-video", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d body %s", response.Code, response.Body.String())
	}
}
