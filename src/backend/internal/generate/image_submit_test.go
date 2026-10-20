package generate

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestImageRejectsEmptyPromptAndUnknownModel(t *testing.T) {
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1"})
	empty := httptest.NewRecorder()
	handler.ServeHTTP(empty, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"  "}`)))
	if empty.Code != http.StatusBadRequest || !strings.Contains(empty.Body.String(), "提示词不能为空") {
		t.Fatalf("empty prompt %d %s", empty.Code, empty.Body.String())
	}
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"   "}`)))
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), "模型名称不能为空") {
		t.Fatalf("model %d %s", unknown.Code, unknown.Body.String())
	}
}

func TestImageGatewayMismatchAndMissingKey(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	gapnet := httptest.NewRecorder()
	handler.ServeHTTP(gapnet, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customBaseUrl":"https://api.gapnet.ai/endpoint","customApiKey":"secret"}`)))
	if gapnet.Code != http.StatusBadRequest || !strings.Contains(gapnet.Body.String(), "gpt-image-2 请使用 Comfly") {
		t.Fatalf("gapnet %d %s", gapnet.Code, gapnet.Body.String())
	}
	lianchi := httptest.NewRecorder()
	handler.ServeHTTP(lianchi, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"openai/gpt-image-2"}`)))
	if lianchi.Code != http.StatusBadRequest || !strings.Contains(lianchi.Body.String(), "未配置联池 API Key") {
		t.Fatalf("lianchi %d %s", lianchi.Code, lianchi.Body.String())
	}
}

func TestWorkshopOriginalRequiresProductImage(t *testing.T) {
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","workshopMode":"storyboard_generate"}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "原创生图缺少商品垫图") {
		t.Fatalf("product %d %s", response.Code, response.Body.String())
	}
}

func TestImageModelRules(t *testing.T) {
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	qwen := httptest.NewRecorder()
	handler.ServeHTTP(qwen, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"改成白底","model":"qwen-image-edit","customApiKey":"secret"}`)))
	if qwen.Code != http.StatusBadRequest || !strings.Contains(qwen.Body.String(), "Qwen 图像编辑需要至少一张参考图") {
		t.Fatalf("qwen %d %s", qwen.Code, qwen.Body.String())
	}
	seedream := httptest.NewRecorder()
	handler.ServeHTTP(seedream, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"seedream-v5-pro","customApiKey":"secret","size":"4K"}`)))
	if seedream.Code != http.StatusBadRequest || !strings.Contains(seedream.Body.String(), "仅支持 1K～2K") {
		t.Fatalf("seedream %d %s", seedream.Code, seedream.Body.String())
	}
	many := httptest.NewRecorder()
	handler.ServeHTTP(many, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"改背景","model":"qwen-image-edit","customApiKey":"secret","images":["https://example.com/a.jpg","https://example.com/b.jpg"]}`)))
	if many.Code != http.StatusBadRequest || !strings.Contains(many.Body.String(), "仅支持一张参考图") {
		t.Fatalf("many %d %s", many.Code, many.Body.String())
	}
	wide := httptest.NewRecorder()
	handler.ServeHTTP(wide, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"seedream-v5-pro","customApiKey":"secret","size":"21:9"}`)))
	if wide.Code != http.StatusBadRequest || !strings.Contains(wide.Body.String(), "超出已验证的 1K～2K") {
		t.Fatalf("wide %d %s", wide.Code, wide.Body.String())
	}
}

func TestImageTaskKeyResolvesDirectPoll(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "images.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE ImageTask (
		taskId TEXT, workspaceId TEXT, idempotencyKey TEXT, resultUrl TEXT, status TEXT, failReason TEXT, createdAt TEXT, mediaType TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO ImageTask VALUES ('direct_from_key','local','idem-1','https://example.com/b.jpg','SUCCESS',NULL,'2026-01-01','image')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + dbPath})
	found := httptest.NewRecorder()
	handler.ServeHTTP(found, httptest.NewRequest(http.MethodGet, "/api/generate/image?taskKey=idem-1", nil))
	if found.Code != http.StatusOK || !strings.Contains(found.Body.String(), "direct_from_key") || !strings.Contains(found.Body.String(), "https://example.com/b.jpg") {
		t.Fatalf("key %d %s", found.Code, found.Body.String())
	}
}

func TestDirectImagePollReadsRecord(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "images.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE ImageTask (taskId TEXT, resultUrl TEXT, status TEXT, failReason TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO ImageTask VALUES ('direct_ok','https://example.com/a.jpg','SUCCESS',NULL)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + dbPath})
	found := httptest.NewRecorder()
	handler.ServeHTTP(found, httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=direct_ok", nil))
	if found.Code != http.StatusOK || !strings.Contains(found.Body.String(), `"status":"SUCCESS"`) || !strings.Contains(found.Body.String(), "https://example.com/a.jpg") {
		t.Fatalf("found %d %s", found.Code, found.Body.String())
	}
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=direct_missing", nil))
	if missing.Code != http.StatusNotFound || !strings.Contains(missing.Body.String(), "未找到同步任务记录") {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
}

func TestImagePollRequiresTask(t *testing.T) {
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/generate/image", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "缺少 taskId 参数") {
		t.Fatalf("poll %d %s", response.Code, response.Body.String())
	}
}

func TestImageSubmitAndPollUseGateway(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"task_id":"img-task-1"}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"status":"SUCCESS","url":"https://cdn.example.com/out.jpg"}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	dbPath := filepath.Join(t.TempDir(), "images.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT, "workspaceId" TEXT, "productId" TEXT, "prompt" TEXT, "taskId" TEXT, "status" TEXT,
		"resultUrl" TEXT, "failReason" TEXT, "model" TEXT, "mediaType" TEXT, "size" TEXT, "quality" TEXT,
		"idempotencyKey" TEXT, "createdAt" TEXT, "updatedAt" TEXT
	)`)
	if err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + dbPath, NodeEnv: "development"})
	created := httptest.NewRecorder()
	handler.ServeHTTP(created, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if created.Code != http.StatusOK || !strings.Contains(created.Body.String(), `"taskId":"img-task-1"`) || !strings.Contains(created.Body.String(), `"status":"IN_PROGRESS"`) {
		t.Fatalf("submit %d %s", created.Code, created.Body.String())
	}
	polled := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=img-task-1", nil)
	request.Header.Set("x-custom-base-url", server.URL)
	request.Header.Set("x-custom-api-key", "secret")
	handler.ServeHTTP(polled, request)
	if polled.Code != http.StatusOK || !strings.Contains(polled.Body.String(), `"status":"SUCCESS"`) || !strings.Contains(polled.Body.String(), "https://cdn.example.com/out.jpg") {
		t.Fatalf("poll %d %s", polled.Code, polled.Body.String())
	}
}

const tinyPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func TestImageEditSubmitsMultipart(t *testing.T) {
	expected, err := base64.StdEncoding.DecodeString(tinyPNG)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Errorf("content-type %s", r.Header.Get("Content-Type"))
		}
		raw, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			t.Error(readErr)
			return
		}
		form, formErr := multipart.NewReader(bytes.NewReader(raw), boundaryOf(r.Header.Get("Content-Type"))).ReadForm(8 << 20)
		if formErr != nil {
			t.Errorf("form %v", formErr)
			return
		}
		if form.Value["model"][0] != "gpt-image-2" || form.Value["prompt"][0] != "改封面" {
			t.Errorf("fields %#v", form.Value)
		}
		if _, ok := form.Value["image"]; ok {
			t.Errorf("image must be a file, got %v", form.Value["image"])
		}
		files := form.File["image"]
		if len(files) != 1 || files[0].Header.Get("Content-Type") != "image/png" {
			t.Errorf("files %#v", files)
			return
		}
		opened, openErr := files[0].Open()
		if openErr != nil {
			t.Error(openErr)
			return
		}
		defer opened.Close()
		got, _ := io.ReadAll(opened)
		if !bytes.Equal(got, expected) {
			t.Errorf("image bytes %d", len(got))
		}
		_, _ = w.Write([]byte(`{"task_id":"edit-1"}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	body := `{"prompt":"改封面","model":"gpt-image-2","size":"1024x1024","quality":"high","customApiKey":"secret","customBaseUrl":"` + server.URL + `","images":["data:image/png;base64,` + tinyPNG + `"]}`
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(body)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"taskId":"edit-1"`) {
		t.Fatalf("submit %d %s", response.Code, response.Body.String())
	}
}

func TestImageGenerationStaysJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("content-type %s", r.Header.Get("Content-Type"))
		}
		raw, _ := io.ReadAll(r.Body)
		if !bytes.Contains(raw, []byte(`"prompt":"一只猫"`)) || bytes.Contains(raw, []byte(`"image"`)) {
			t.Errorf("body %s", raw)
		}
		_, _ = w.Write([]byte(`{"task_id":"json-1"}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"taskId":"json-1"`) {
		t.Fatalf("submit %d %s", response.Code, response.Body.String())
	}
}

func TestImageEditRejectsBadDataURL(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	body := `{"prompt":"改封面","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"` + server.URL + `","images":["data:image/png;base64,%%%"]}`
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(body)))
	if hits != 0 || response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "第 1 张参考图无法读取") {
		t.Fatalf("hits %d status %d body %s", hits, response.Code, response.Body.String())
	}
}

func imageTaskDatabase(t *testing.T) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "images.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE "ImageTask" (
		"id" TEXT, "workspaceId" TEXT, "productId" TEXT, "prompt" TEXT, "taskId" TEXT, "status" TEXT,
		"resultUrl" TEXT, "failReason" TEXT, "model" TEXT, "mediaType" TEXT, "size" TEXT, "quality" TEXT,
		"idempotencyKey" TEXT, "createdAt" TEXT, "updatedAt" TEXT
	)`)
	if err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	return dbPath
}

func TestGptImageSizeStaysInsidePixelBudget(t *testing.T) {
	model, size, quality := normalizeGptImageRequest("gpt-image-2", "3072x3072", "high")
	if model != "gpt-image-2" || size != "2880x2880" || quality != "high" {
		t.Fatalf("budget %s %s %s", model, size, quality)
	}
	model, size, quality = normalizeGptImageRequest("gpt-image-2-4k", "3072x3072", "high")
	if model != "gpt-image-2-4k" || size != "2880x2880" || quality != "" {
		t.Fatalf("suffix %s %s %q", model, size, quality)
	}
	adapted := buildImagePayload("gpt-image-2", "一只猫", "3072x3072", "high", "", nil)
	if adapted.payload["size"] != "2880x2880" || adapted.payload["quality"] != "high" {
		t.Fatalf("payload %#v", adapted.payload)
	}
	if _, ok := buildImagePayload("gpt-image-2-4k", "一只猫", "3072x3072", "high", "high", nil).payload["quality"]; ok {
		t.Fatal("4k suffix must omit quality")
	}
	chosen := buildImagePayload("gpt-image-2", "一只猫", "1024x1024", "low", "high", nil)
	if chosen.payload["quality"] != "high" || chosen.payload["size"] != "1024x1024" {
		t.Fatalf("imageQuality %#v", chosen.payload)
	}
	for _, model := range []string{"doubao-seedream-4-0-250828", "nano-banana-pro", "qwen-image-max"} {
		payload := buildImagePayload(model, "一只猫", "1024x1024", "high", "high", nil).payload
		if _, ok := payload["quality"]; ok {
			t.Fatalf("%s sent quality %#v", model, payload)
		}
	}
}

func TestLianchiEditUsesImageArrayField(t *testing.T) {
	body, contentType, err := buildImageEditBody(t.Context(), map[string]any{
		"model": "openai/gpt-image-2", "prompt": "改封面", "size": "1024x1024", "quality": "high",
		"image": []string{"data:image/png;base64," + tinyPNG},
	}, "", false)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := io.ReadAll(body)
	if err != nil {
		t.Fatal(err)
	}
	form, err := multipart.NewReader(bytes.NewReader(raw), boundaryOf(contentType)).ReadForm(8 << 20)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := form.File["image"]; ok {
		t.Fatal("lianchi field must be image[]")
	}
	if len(form.File["image[]"]) != 1 || form.File["image[]"][0].Header.Get("Content-Type") != "image/png" {
		t.Fatalf("files %#v", form.File)
	}
	urls := imageSubmitURLs("https://api.gapnet.ai/endpoint", true, "openai-dalle", "openai/gpt-image-2")
	if len(urls) != 1 || urls[0] != "https://api.gapnet.ai/endpoint/v1/images/edits" {
		t.Fatalf("urls %v", urls)
	}
	generations := imageSubmitURLs("https://api.gapnet.ai/endpoint", false, "openai-dalle", "openai/gpt-image-2")
	if len(generations) != 1 || strings.Contains(generations[0], "async=true") || !strings.HasSuffix(generations[0], "/v1/images/generations") {
		t.Fatalf("generations %v", generations)
	}
}

func boundaryOf(contentType string) string {
	_, value, _ := strings.Cut(contentType, "boundary=")
	return strings.Trim(value, `"`)
}

func TestNativeQwenImageRejectsNonDashscopeGateway(t *testing.T) {
	called := false
	previous := ModelHTTP
	ModelHTTP = func() *http.Client {
		called = true
		return http.DefaultClient
	}
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"qwen-image-3.0-pro","customApiKey":"secret","customBaseUrl":"https://ai.comfly.org"}`)))
	if response.Code != http.StatusBadRequest || called {
		t.Fatalf("status %d called %v body %s", response.Code, called, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"submissionRejected":true`) || !strings.Contains(response.Body.String(), "千问原生生图接口") {
		t.Fatalf("body %s", response.Body.String())
	}
}

func TestGatewayQwenImageIsNotForcedToDashscope(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"令牌不合法"}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"qwen-image","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if !called || strings.Contains(response.Body.String(), "千问原生生图接口") {
		t.Fatalf("status %d called %v body %s", response.Code, called, response.Body.String())
	}
}

func TestImageUpstreamRejectionReturns400WithSubmissionRejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"code":"invalid_request","message":"令牌不合法","type":"new_api_error"}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"invalid-key","customBaseUrl":"`+server.URL+`"}`)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", response.Code)
	}
	body := response.Body.String()
	if !strings.Contains(body, `"submissionRejected":true`) || !strings.Contains(body, "令牌不合法") {
		t.Fatalf("expected submissionRejected and upstream error message, got %s", body)
	}
}

func TestImageTaskKeySeesPendingSubmission(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			once.Do(func() { close(started) })
			<-release
			_, _ = w.Write([]byte(`{"task_id":"img-later"}`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	created := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`))
	request.Header.Set("x-idempotency-key", "idem-pending")
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(created, request)
		close(done)
	}()
	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("upstream submit did not start")
	}
	found := httptest.NewRecorder()
	handler.ServeHTTP(found, httptest.NewRequest(http.MethodGet, "/api/generate/image?taskKey=idem-pending", nil))
	if found.Code != http.StatusOK || !strings.Contains(found.Body.String(), `"submissionPending":true`) || !strings.Contains(found.Body.String(), `"status":"IN_PROGRESS"`) || strings.Contains(found.Body.String(), "尚未找到原任务记录") {
		t.Fatalf("pending %d %s", found.Code, found.Body.String())
	}
	close(release)
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("submit did not finish")
	}
	if created.Code != http.StatusOK || !strings.Contains(created.Body.String(), `"taskId":"img-later"`) {
		t.Fatalf("submit %d %s", created.Code, created.Body.String())
	}
}

func TestImageTaskKeyReturnsUpstreamFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"尺寸不合法"}}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	created := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`))
	request.Header.Set("x-idempotency-key", "idem-fail")
	handler.ServeHTTP(created, request)
	if created.Code != http.StatusBadRequest || !strings.Contains(created.Body.String(), "尺寸不合法") {
		t.Fatalf("submit %d %s", created.Code, created.Body.String())
	}
	found := httptest.NewRecorder()
	handler.ServeHTTP(found, httptest.NewRequest(http.MethodGet, "/api/generate/image?taskKey=idem-fail", nil))
	body := found.Body.String()
	if found.Code != http.StatusOK || !strings.Contains(body, `"status":"FAILURE"`) || !strings.Contains(body, "尺寸不合法") || strings.Contains(body, "尚未找到原任务记录") {
		t.Fatalf("key %d %s", found.Code, body)
	}
}
