package generate

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestViduAndGrokPayloadsFollowOfficialAPIs(t *testing.T) {
	first := "https://example.com/a.jpg"
	last := "https://example.com/b.jpg"
	clip := "https://example.com/clip.mp4"
	reference := buildVideoPayload("viduq3", "海边", map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "omni"), "images": rawJSON(t, []string{first, last}),
		"aspect_ratio": rawJSON(t, "9:16"), "resolution": rawJSON(t, "1080P"), "duration": rawJSON(t, 5),
		"audio": json.RawMessage(`false`),
	})
	if !strings.Contains(reference.endpoints[0], "/reference2video") || reference.payload["image"] != nil || reference.payload["aspect_ratio"] != "9:16" {
		t.Fatalf("vidu reference: %#v %v", reference.payload, reference.endpoints)
	}
	if images, _ := reference.payload["images"].([]string); len(images) != 2 || images[0] != first || reference.payload["resolution"] != "1080p" || reference.payload["audio"] != false {
		t.Fatalf("vidu reference body: %#v", reference.payload)
	}
	frame := buildVideoPayload("viduq3-pro", "海边", map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "first_frame"), "images": rawJSON(t, []string{first}),
		"aspect_ratio": rawJSON(t, "9:16"), "resolution": rawJSON(t, "720P"), "duration": rawJSON(t, 5),
	})
	if !strings.Contains(frame.endpoints[0], "/img2video") {
		t.Fatalf("vidu frame endpoint: %v", frame.endpoints)
	}
	if _, ok := frame.payload["aspect_ratio"]; ok {
		t.Fatalf("img2video includes aspect_ratio: %#v", frame.payload)
	}
	if images, _ := frame.payload["images"].([]string); len(images) != 1 || images[0] != first {
		t.Fatalf("vidu frame images: %#v", frame.payload["images"])
	}
	grok := buildVideoPayload("grok-imagine-video-1.5", "海边", map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "omni"), "images": rawJSON(t, []string{first, last}),
		"aspect_ratio": rawJSON(t, "9:16"), "resolution": rawJSON(t, "720P"), "duration": rawJSON(t, 5),
	})
	if !strings.Contains(grok.endpoints[0], "/xai/v1/videos/generations") || grok.payload["image"] != nil {
		t.Fatalf("grok reference: %#v %v", grok.payload, grok.endpoints)
	}
	edited := buildVideoPayload("grok-imagine-video-1.5", "改项链", map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "edit"), "videos": rawJSON(t, []string{clip}),
		"duration": rawJSON(t, 5), "resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "16:9"),
	})
	if !strings.Contains(edited.endpoints[0], "/xai/v1/videos/edits") || edited.payload["duration"] != nil {
		t.Fatalf("grok edit: %#v %v", edited.payload, edited.endpoints)
	}
	extended := buildVideoPayload("grok-imagine-video-1.5", "继续走", map[string]json.RawMessage{
		"ref_mode": rawJSON(t, "extend"), "videos": rawJSON(t, []string{clip}),
		"resolution": rawJSON(t, "720P"), "aspect_ratio": rawJSON(t, "16:9"),
	})
	if !strings.Contains(extended.endpoints[0], "/xai/v1/videos/extensions") || extended.payload["duration"] != 6 {
		t.Fatalf("grok extend: %#v %v", extended.payload, extended.endpoints)
	}
}

func TestVideoPayloadRequestsNativeAudio(t *testing.T) {
	withAudio := buildVideoPayload("doubao-seedance-2.5", "海边", map[string]json.RawMessage{
		"audio": json.RawMessage(`true`),
	})
	if withAudio.payload["audio"] != true || withAudio.payload["generate_audio"] != true {
		t.Fatalf("native audio flags: %#v", withAudio.payload)
	}
	silent := buildVideoPayload("doubao-seedance-2.5", "海边", map[string]json.RawMessage{})
	if _, ok := silent.payload["generate_audio"]; ok {
		t.Fatalf("audio should stay unset: %#v", silent.payload)
	}
}

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
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(`{"prompt":"海边","model":"   "}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "String must contain at least 1 character(s)") {
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
