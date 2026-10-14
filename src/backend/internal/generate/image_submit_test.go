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

func TestImageRejectsEmptyPromptAndUnknownModel(t *testing.T) {
	handler := Image(config.Config{Upstream: "http://127.0.0.1:1"})
	empty := httptest.NewRecorder()
	handler.ServeHTTP(empty, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"  "}`)))
	if empty.Code != http.StatusBadRequest || !strings.Contains(empty.Body.String(), "提示词不能为空") {
		t.Fatalf("empty prompt %d %s", empty.Code, empty.Body.String())
	}
	unknown := httptest.NewRecorder()
	handler.ServeHTTP(unknown, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"not-a-model"}`)))
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), "模型 not-a-model 不在当前生图白名单中") {
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
		taskId TEXT, workspaceId TEXT, idempotencyKey TEXT, resultUrl TEXT, status TEXT, failReason TEXT, createdAt TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO ImageTask VALUES ('direct_from_key','local','idem-1','https://example.com/b.jpg','SUCCESS',NULL,'2026-01-01')`); err != nil {
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
	previous := modelHTTP
	modelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { modelHTTP = previous })
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
