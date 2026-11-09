package assistant

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestAssistantVideoMedia(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	handler := Media(config.Config{})
	webm := append([]byte{0x1A, 0x45, 0xDF, 0xA3}, []byte("rest")...)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader(string(webm)))
	request.Header.Set("Content-Type", "video/webm")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "/storage/local/assistant-attachments/") || !strings.Contains(response.Body.String(), ".webm") {
		t.Fatalf("save %d %s", response.Code, response.Body.String())
	}
	unsupported := httptest.NewRecorder()
	badType := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader("video"))
	badType.Header.Set("Content-Type", "video/avi")
	handler.ServeHTTP(unsupported, badType)
	if unsupported.Code != http.StatusUnsupportedMediaType || !strings.Contains(unsupported.Body.String(), "目前支持 MP4、MOV 和 WebM 视频") {
		t.Fatalf("type %d %s", unsupported.Code, unsupported.Body.String())
	}
	mismatch := httptest.NewRecorder()
	badBody := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader(strings.Repeat("0", 12)))
	badBody.Header.Set("Content-Type", "video/mp4")
	handler.ServeHTTP(mismatch, badBody)
	if mismatch.Code != http.StatusBadRequest || !strings.Contains(mismatch.Body.String(), "视频内容与文件格式不匹配") {
		t.Fatalf("header %d %s", mismatch.Code, mismatch.Body.String())
	}
	empty := httptest.NewRecorder()
	emptyReq := httptest.NewRequest(http.MethodPost, "/api/assistant/media", strings.NewReader(""))
	emptyReq.Header.Set("Content-Type", "video/mp4")
	handler.ServeHTTP(empty, emptyReq)
	if empty.Code != http.StatusBadRequest || !strings.Contains(empty.Body.String(), "附件内容不能为空") {
		t.Fatalf("empty %d %s", empty.Code, empty.Body.String())
	}
	_ = os.RemoveAll(os.Getenv("AZHUO_CACHE_DIR"))
}

func TestAssistantImageMedia(t *testing.T) {
	t.Setenv("AZHUO_CACHE_DIR", t.TempDir())
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	handler := Media(config.Config{})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/assistant/media", &encoded)
	request.Header.Set("Content-Type", "image/png")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), ".jpg") {
		t.Fatalf("image %d %s", response.Code, response.Body.String())
	}
}

func TestOrientImageRotatesClockwise(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 2, 1))
	source.SetRGBA(0, 0, color.RGBA{R: 255, A: 255})
	source.SetRGBA(1, 0, color.RGBA{B: 255, A: 255})
	rotated := orientImage(source, 6)
	if rotated.Bounds().Dx() != 1 || rotated.Bounds().Dy() != 2 {
		t.Fatalf("size %v", rotated.Bounds())
	}
	top := rotated.At(0, 0)
	bottom := rotated.At(0, 1)
	if top != (color.RGBA{R: 255, A: 255}) || bottom != (color.RGBA{B: 255, A: 255}) {
		t.Fatalf("top %v bottom %v", top, bottom)
	}
}

func TestAssistantMemory(t *testing.T) {
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	dbPath := filepath.Join(t.TempDir(), "memory.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssistantThread (id TEXT, workspaceId TEXT, messagesJson TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssistantThread VALUES ('gone','local',?)`, DeletedThreadMessages); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := Memory(config.Config{DatabaseURL: "file:" + dbPath})
	missing := httptest.NewRecorder()
	long := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/long/memory", nil)
	long.SetPathValue("threadId", strings.Repeat("a", 257))
	handler.ServeHTTP(missing, long)
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "会话标识无效") {
		t.Fatalf("id %d %s", missing.Code, missing.Body.String())
	}
	fresh := httptest.NewRecorder()
	freshRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/thread-1/memory", nil)
	freshRequest.SetPathValue("threadId", "thread-1")
	handler.ServeHTTP(fresh, freshRequest)
	if fresh.Code != http.StatusOK || !strings.Contains(fresh.Body.String(), `"enabled":true`) || !strings.Contains(fresh.Body.String(), `"pendingCount":0`) {
		t.Fatalf("get %d %s", fresh.Code, fresh.Body.String())
	}
	disabled := httptest.NewRecorder()
	put := httptest.NewRequest(http.MethodPut, "/api/assistant/threads/thread-1/memory", strings.NewReader(`{"enabled":false}`))
	put.SetPathValue("threadId", "thread-1")
	handler.ServeHTTP(disabled, put)
	if disabled.Code != http.StatusOK || !strings.Contains(disabled.Body.String(), `"enabled":false`) {
		t.Fatalf("put %d %s", disabled.Code, disabled.Body.String())
	}
	deleted := httptest.NewRecorder()
	deletedRequest := httptest.NewRequest(http.MethodGet, "/api/assistant/threads/gone/memory", nil)
	deletedRequest.SetPathValue("threadId", "gone")
	handler.ServeHTTP(deleted, deletedRequest)
	if deleted.Code != http.StatusNotFound || !strings.Contains(deleted.Body.String(), "会话已删除") {
		t.Fatalf("deleted %d %s", deleted.Code, deleted.Body.String())
	}
}
