package library

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/platform/database"
	"beike.local/cloud/src/backend/internal/platform/storage"
)

func TestDeconstructRequestCompletesInGo(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	vision := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("vision path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": `{"per_image":[{"image_index":1,"reverse_prompt_zh":"白底","has_human":false,"title":"图"}],"content_summary":"测试","theme_category":"general"}`}}},
		})
	}))
	defer vision.Close()
	dbPath := filepath.Join(t.TempDir(), "review.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructReview" (
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "albumName" TEXT, "payload" TEXT, "status" TEXT, "createdAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{NodeEnv: "development", DatabaseURL: "file:" + dbPath}
	body := `{"imageUrls":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="],"customApiKey":"secret","customBaseUrl":"` + vision.URL + `","model":"gpt-5.6-luna","reviewBeforeSave":true,"clientTaskId":"task-1"}`
	response := httptest.NewRecorder()
	deconstructRequestHandler(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(body)))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"success":true`) || !strings.Contains(response.Body.String(), `"reviewStatus":"pending"`) {
		t.Fatalf("deconstruct %d %s", response.Code, response.Body.String())
	}
	progress := httptest.NewRecorder()
	deconstructProgressHandler(cfg).ServeHTTP(progress, httptest.NewRequest(http.MethodGet, "/api/catalog/assets/deconstruct/progress?clientTaskId=task-1", nil))
	if progress.Code != http.StatusOK || !strings.Contains(progress.Body.String(), `"stage":"completed"`) {
		t.Fatalf("progress %d %s", progress.Code, progress.Body.String())
	}
}

func TestDeconstructJobSubmitDoesNotProxy(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	dbPath := filepath.Join(t.TempDir(), "jobs.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructJob" (
		"id" TEXT, "workspaceId" TEXT, "jobId" TEXT, "inputHash" TEXT, "status" TEXT, "configJson" TEXT,
		"concurrency" INTEGER, "reviewBeforeSave" INTEGER, "stopRequested" INTEGER, "error" TEXT,
		"createdAt" TEXT, "updatedAt" TEXT, "finishedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE "DeconstructJobItem" (
		"id" TEXT, "workspaceId" TEXT, "jobId" TEXT, "itemId" TEXT, "position" INTEGER, "inputJson" TEXT,
		"status" TEXT, "progressJson" TEXT, "resultJson" TEXT, "error" TEXT, "startedAt" TEXT,
		"dispatchedAt" TEXT, "finishedAt" TEXT, "updatedAt" TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	cfg := config.Config{NodeEnv: "development", DatabaseURL: "file:" + dbPath}
	body := `{"jobId":"job-1","overrides":{"textProtocol":"anthropic"},"items":[{"id":"a","name":"套组","images":["https://127.0.0.1:1/a.jpg"]}]}`
	response := httptest.NewRecorder()
	deconstructJobsPostHandler(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct/jobs", strings.NewReader(body)))
	if response.Code != http.StatusAccepted || !strings.Contains(response.Body.String(), `"jobId":"job-1"`) {
		t.Fatalf("submit %d %s", response.Code, response.Body.String())
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		read, err := database.OpenWrite(dbPath)
		if err != nil {
			t.Fatal(err)
		}
		var status, storedConfig string
		err = read.QueryRow(`SELECT "status", "configJson" FROM "DeconstructJob" WHERE "jobId" = 'job-1'`).Scan(&status, &storedConfig)
		if err == nil && !strings.Contains(storedConfig, `"textProtocol":"anthropic"`) {
			t.Fatalf("async protocol lost: %s", storedConfig)
		}
		_ = read.Close()
		if err == nil && status == "failed" {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("job did not finish without replaying a paid call")
}

func TestReferenceArchiveRetainsBytesAndIsReadableByWorkspace(t *testing.T) {
	root := t.TempDir()
	cfg := config.Config{DatabaseURL: "file:" + filepath.Join(root, "test.db")}
	image := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	first, err := archiveDeconstructOriginals(cfg, "workspace-a", []string{image})
	if err != nil {
		t.Fatal(err)
	}
	second, err := archiveDeconstructOriginals(cfg, "workspace-a", []string{image})
	if err != nil || first[0] != second[0] {
		t.Fatal("retries did not reuse original", err)
	}
	rel := strings.TrimPrefix(first[0], "/storage/")
	if !storage.WorkspaceRel(rel, "workspace-a", false) || storage.WorkspaceRel(rel, "workspace-b", false) {
		t.Fatal("archive workspace isolation failed")
	}
	body, err := os.ReadFile(filepath.Join(root, "storage", filepath.FromSlash(rel)))
	if err != nil {
		t.Fatal(err)
	}
	if base64.StdEncoding.EncodeToString(body) != strings.SplitN(image, ",", 2)[1] {
		t.Fatal("archived reference lost original bytes")
	}
}

func TestIncompleteReferenceCountsFailBeforeDownload(t *testing.T) {
	for _, count := range []int{2, 3, 5, 6, 7, 9, 10} {
		_, _, err := prepareDeconstructImages(config.Config{}, make([]string, count))
		if err == nil || !strings.Contains(err.Error(), "4 张或 8 张") {
			t.Fatalf("count=%d: %v", count, err)
		}
	}
}

func TestIncompleteDownloadNeverReordersOrMixesFourImageGroups(t *testing.T) {
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/missing" {
			w.WriteHeader(404)
			return
		}
		_, _ = w.Write(png)
	}))
	defer server.Close()
	urls := []string{}
	for i := 0; i < 8; i++ {
		urls = append(urls, server.URL+"/ok")
	}
	urls[2] = server.URL + "/missing"
	prepared, originals, err := prepareDeconstructImages(config.Config{}, urls)
	if err == nil || len(prepared) > 0 || len(originals) > 0 {
		t.Fatal("failed image silently removed and later group shifted into its place")
	}
}

func TestReverseResultsMustMatchEveryOriginal(t *testing.T) {
	valid := []any{
		map[string]any{"image_index": float64(1), "reverse_prompt_zh": "镜头一"},
		map[string]any{"image_index": float64(2), "reverse_prompt_zh": "镜头二"},
	}
	if err := validateVisionImages(valid, 2); err != nil {
		t.Fatal(err)
	}
	if validateVisionImages(valid[:1], 2) == nil {
		t.Fatal("missing image description accepted")
	}
	valid[1].(map[string]any)["image_index"] = float64(1)
	if validateVisionImages(valid, 2) == nil {
		t.Fatal("duplicate image index accepted")
	}
}

func TestDeconstructVisionUsesNativeProtocolOverride(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/messages" || r.Header.Get("x-api-key") != "secret" {
			t.Errorf("native request %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"{\"per_image\":[{}]}"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":2}}`))
	}))
	defer server.Close()
	outcome := callDeconstructVision(gateway.WithTextProtocol(context.Background(), "anthropic"), server.URL, "secret", "custom-vision", []string{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}, "分析图片")
	if outcome.Fail != nil || outcome.Text != `{"per_image":[{}]}` || calls != 1 {
		t.Fatalf("outcome %#v calls %d", outcome, calls)
	}
}

func TestDeconstructNativeQuotaIsNotReplayed(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(429)
		_, _ = w.Write([]byte(`{"error":{"message":"quota exhausted"}}`))
	}))
	defer server.Close()
	outcome := callDeconstructVision(context.Background(), server.URL, "secret", "gemini-2.5-flash", []string{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}, "分析图片")
	if outcome.Code != 429 || calls != 1 || !strings.Contains(outcome.Fail["error"].(string), "余额") {
		t.Fatalf("outcome %#v calls %d", outcome, calls)
	}
}

func TestDeconstructInvalidProtocolStopsBeforeImagePreparation(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	status, body := executeDeconstruct(config.Config{}, r, map[string]any{"textProtocol": "invalid", "imageUrls": []any{"https://example.com/image.jpg"}}, deconstructHooks{})
	if status != 400 || !strings.Contains(body["error"].(string), "textProtocol") {
		t.Fatalf("status %d body %#v", status, body)
	}
}

func TestDeconstructRequestImageRules(t *testing.T) {
	t.Setenv("AI_DRAWING_API_KEY", "")
	t.Setenv("AI_API_KEY", "")
	handler := deconstructRequestHandler(config.Config{NodeEnv: "development"})
	empty := httptest.NewRecorder()
	handler.ServeHTTP(empty, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{}`)))
	if empty.Code != http.StatusBadRequest || !strings.Contains(empty.Body.String(), "请至少提供 1 张参考风格或买家秀图片") {
		t.Fatalf("empty %d %s", empty.Code, empty.Body.String())
	}
	short := httptest.NewRecorder()
	handler.ServeHTTP(short, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"imageUrls":["a","b"]}`)))
	if short.Code != http.StatusBadRequest || !strings.Contains(short.Body.String(), "INCOMPLETE_CONTENT_GROUP") {
		t.Fatalf("short %d %s", short.Code, short.Body.String())
	}
	dbPath := filepath.Join(t.TempDir(), "categories.db")
	db, err := database.OpenWrite(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE AssetProductCategory (
		id TEXT, workspaceId TEXT, name TEXT, parentId TEXT, isArchived INTEGER, aliases TEXT
	)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO AssetProductCategory VALUES ('jewelry','local','珠宝',NULL,0,'[]')`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	withDB := deconstructRequestHandler(config.Config{NodeEnv: "development", DatabaseURL: "file:" + dbPath})
	missingCategory := httptest.NewRecorder()
	withDB.ServeHTTP(missingCategory, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"targetCategory":"shoes","imageUrls":["a"]}`)))
	if missingCategory.Code != http.StatusBadRequest || !strings.Contains(missingCategory.Body.String(), "所选商品大类不存在") {
		t.Fatalf("category %d %s", missingCategory.Code, missingCategory.Body.String())
	}
	textOnly := httptest.NewRecorder()
	handler.ServeHTTP(textOnly, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"imageUrls":["a"],"customApiKey":"secret","apiFormat":"openai-responses","model":"whisper-1"}`)))
	if textOnly.Code != http.StatusBadRequest || !strings.Contains(textOnly.Body.String(), "支持图像输入的多模态模型") {
		t.Fatalf("vision %d %s", textOnly.Code, textOnly.Body.String())
	}
	needsMajor := httptest.NewRecorder()
	withDB.ServeHTTP(needsMajor, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"targetSubcategory":"phone"}`)))
	if needsMajor.Code != http.StatusBadRequest || !strings.Contains(needsMajor.Body.String(), "请先选择商品大类，再指定细分文件夹") {
		t.Fatalf("subcategory %d %s", needsMajor.Code, needsMajor.Body.String())
	}
	badFolder := httptest.NewRecorder()
	withDB.ServeHTTP(badFolder, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"targetCategory":"jewelry","targetSubcategory":"abc","imageUrls":["a"]}`)))
	if badFolder.Code != http.StatusBadRequest || !strings.Contains(badFolder.Body.String(), "请选择资产库中的商品细分文件夹") {
		t.Fatalf("folder %d %s", badFolder.Code, badFolder.Body.String())
	}
	nokey := httptest.NewRecorder()
	handler.ServeHTTP(nokey, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct", strings.NewReader(`{"imageUrls":["a"]}`)))
	if nokey.Code != http.StatusBadRequest || !strings.Contains(nokey.Body.String(), "系统尚未配置 AI 视觉接口密钥") {
		t.Fatalf("key %d %s", nokey.Code, nokey.Body.String())
	}
}
