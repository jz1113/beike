package generate

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestVideoBodyMatchesContract(t *testing.T) {
	handler := Video(config.Config{Upstream: "http://127.0.0.1:1"})
	cases := []struct {
		body    string
		message string
	}{
		{`{}`, "Required"},
		{`{"prompt":"  "}`, "视频提示词不能为空"},
		{`{"prompt":"ok","model":""}`, "String must contain at least 1 character(s)"},
		{`{"prompt":"ok","duration":"x"}`, "Expected number, received string"},
		{`{"prompt":"ok","images":[""]}`, "String must contain at least 1 character(s)"},
		{`{"prompt":"ok","fps":0}`, "Number must be greater than 0"},
		{`{"prompt":"ok","seed":1.5}`, "Expected integer, received float"},
	}
	for _, item := range cases {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(item.body)))
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), item.message) {
			t.Fatalf("body %s status %d response %s", item.body, response.Code, response.Body.String())
		}
	}
}

func TestVideoRejectsUnknownModel(t *testing.T) {
	handler := Video(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"not-a-video"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "模型 not-a-video 不在当前生视频白名单中") {
		t.Fatalf("model %d %s", response.Code, response.Body.String())
	}
}

func TestVideoInputModeRules(t *testing.T) {
	handler := Video(config.Config{Upstream: "http://127.0.0.1:1"})
	text := httptest.NewRecorder()
	handler.ServeHTTP(text, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","ref_mode":"text","images":["https://example.com/a.jpg"]}`)))
	if text.Code != http.StatusBadRequest || !strings.Contains(text.Body.String(), "文生视频不使用参考素材") {
		t.Fatalf("text %d %s", text.Code, text.Body.String())
	}
	vidu := httptest.NewRecorder()
	handler.ServeHTTP(vidu, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"viduq3"}`)))
	if vidu.Code != http.StatusBadRequest || !strings.Contains(vidu.Body.String(), "该模型需要参考图片") {
		t.Fatalf("vidu %d %s", vidu.Code, vidu.Body.String())
	}
}

func TestVideoDurationFollowsModel(t *testing.T) {
	handler := Video(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":5}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "不支持所选时长") {
		t.Fatalf("duration %d %s", response.Code, response.Body.String())
	}
	ratio := httptest.NewRecorder()
	handler.ServeHTTP(ratio, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":8,"aspect_ratio":"1:1"}`)))
	if ratio.Code != http.StatusBadRequest || !strings.Contains(ratio.Body.String(), "不支持所选比例") {
		t.Fatalf("ratio %d %s", ratio.Code, ratio.Body.String())
	}
}

func TestVideoPollRequiresTask(t *testing.T) {
	handler := Video(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/generate/video?taskKey=%20", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "任务标识无效") {
		t.Fatalf("poll %d %s", response.Code, response.Body.String())
	}
}

func TestVideoSubmitAndPollUseGateway(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"task_id":"vid-1"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"SUCCESS","video_url":"https://cdn.example.com/a.mp4"}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	dbPath := filepath.Join(t.TempDir(), "videos.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT, "workspaceId" TEXT, "productId" TEXT, "prompt" TEXT, "taskId" TEXT, "status" TEXT,
		"resultUrl" TEXT, "failReason" TEXT, "model" TEXT, "mediaType" TEXT, "size" TEXT, "quality" TEXT,
		"idempotencyKey" TEXT, "createdAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := Video(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + dbPath, NodeEnv: "development"})
	created := httptest.NewRecorder()
	handler.ServeHTTP(created, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"veo3.1","duration":8,"customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if created.Code != http.StatusOK || !strings.Contains(created.Body.String(), `"taskId":"vid-1"`) || !strings.Contains(created.Body.String(), `"status":"IN_PROGRESS"`) {
		t.Fatalf("submit %d %s", created.Code, created.Body.String())
	}
	pending := httptest.NewRecorder()
	handler.ServeHTTP(pending, httptest.NewRequest(http.MethodGet, "/api/generate/video?taskKey=known-key", nil))
	if pending.Code != http.StatusOK || !strings.Contains(pending.Body.String(), "QUERY_FAILED") {
		t.Fatalf("key %d %s", pending.Code, pending.Body.String())
	}
	polled := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=vid-1&model=veo3.1", nil)
	request.Header.Set("x-custom-base-url", server.URL)
	request.Header.Set("x-custom-api-key", "secret")
	handler.ServeHTTP(polled, request)
	if polled.Code != http.StatusOK || !strings.Contains(polled.Body.String(), "https://cdn.example.com/a.mp4") || !strings.Contains(polled.Body.String(), `"status":"SUCCESS"`) {
		t.Fatalf("poll %d %s", polled.Code, polled.Body.String())
	}
}
