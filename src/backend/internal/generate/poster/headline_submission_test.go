package poster

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

const receiptTestImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func phasePost(handler http.Handler, key string, body map[string]any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest("POST", "/phase", strings.NewReader(string(raw)))
	r.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}
func phaseGet(handler http.Handler, key string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("GET", "/phase?operationKey="+key, nil))
	return w
}

func TestS09TitleAndDesignReplayTheirOwnCompletedPhase(t *testing.T) {
	cfg := headlineReceiptConfig(t, coverMemoryConfig(t))
	var calls atomic.Int32
	plan, _ := json.Marshal(map[string]any{
		"title": "台灯", "titleLines": []string{"台灯"}, "productNameLine": "台灯", "composition": "居中", "material": "木桌", "palette": "暖白", "artDirectionId": "A",
		"typographySystem": "A", "typography": "粗黑", "visualAnchor": "灯", "styleFamily": "桌面", "layout": "居中压顶", "typeface": "超粗黑体两行",
		"textColor": "近黑字压在米白底上", "background": "米白纸纹，左上柔光", "subject": "台灯居中，灯头不挡字", "harmony": "米白、近黑、灯的暖铜三色", "variation": "相对上一张改成纸感",
		"imagePrompt": strings.Repeat("生成一张封面并保留商品真实颜色。", 20) + "「台灯」",
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		content := string(plan)
		if n == 1 {
			content = `{"title":"台灯到底值不值"}`
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": content}}}, "usage": map[string]any{"total_tokens": 11}})
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	title := HeadlineTitle(cfg)
	design := HeadlineDesign(cfg)
	body := map[string]any{"model": "gpt-6-luna", "textProtocol": "openai", "originalTitle": "台灯测评", "coverTitle": "台灯", "productName": "台灯", "imageUrls": []string{receiptTestImage}, "customBaseUrl": server.URL, "customApiKey": "fake", "batchId": "batch", "itemId": "item"}
	firstTitle := phasePost(title, "same-key", body)
	if firstTitle.Code != 200 {
		t.Fatalf("title %d %s", firstTitle.Code, firstTitle.Body.String())
	}
	firstDesign := phasePost(design, "same-key", body)
	if firstDesign.Code != 200 {
		t.Fatalf("design %d %s", firstDesign.Code, firstDesign.Body.String())
	}
	var original map[string]any
	_ = json.Unmarshal(firstDesign.Body.Bytes(), &original)
	for _, handler := range []http.Handler{HeadlineTitle(cfg), HeadlineDesign(cfg)} {
		replay := phaseGet(handler, "same-key")
		if replay.Code != 200 || !strings.Contains(replay.Body.String(), `"replayed":true`) || !strings.Contains(replay.Body.String(), `"totalTokens":11`) {
			t.Fatalf("phase query %d %s", replay.Code, replay.Body.String())
		}
	}
	replayDesign := phasePost(design, "same-key", body)
	var replay map[string]any
	_ = json.Unmarshal(replayDesign.Body.Bytes(), &replay)
	if calls.Load() != 2 || replay["memoryUsageId"] != original["memoryUsageId"] {
		t.Fatalf("repeated phase or memory audit calls=%d old=%v new=%v", calls.Load(), original["memoryUsageId"], replay["memoryUsageId"])
	}
	db, err := database.OpenRequired(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err = db.QueryRow(`SELECT COUNT(*) FROM "CoverMemoryUsage"`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicated design audit %d %v", count, err)
	}
}

func TestS09InvalidPaidTitleKeepsUsageAndCannotBeResubmitted(t *testing.T) {
	cfg := headlineReceiptConfig(t, coverMemoryConfig(t))
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"title\":\"bad\"}"}}],"usage":{"total_tokens":6}}`))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	body := map[string]any{"model": "gpt-6-luna", "textProtocol": "openai", "originalTitle": "台灯测评", "imageUrls": []string{receiptTestImage}, "customBaseUrl": server.URL, "customApiKey": "fake"}
	for i := 0; i < 2; i++ {
		w := phasePost(HeadlineTitle(cfg), "invalid-title", body)
		if w.Code != 502 || !strings.Contains(w.Body.String(), `"totalTokens":6`) || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
			t.Fatalf("lost billed error %d %s", w.Code, w.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("resubmitted billed invalid output %d", calls.Load())
	}
}

const learningImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

func TestFeedRequestClaimsAndRecoverStale(t *testing.T) {
	db := learningDB(t)
	ctx := t.Context()
	var wg sync.WaitGroup
	var claimed atomic.Int32
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, yes, err := beginCoverFeed(ctx, db, "local", "unique-key", "样张", "model", "hash", []string{"/a.png"})
			if err != nil {
				t.Error(err)
			}
			if yes {
				claimed.Add(1)
			}
		}()
	}
	wg.Wait()
	if claimed.Load() != 1 {
		t.Fatalf("claims %d", claimed.Load())
	}
	if _, _, err := beginCoverFeed(ctx, db, "local", "unique-key", "样张", "model", "different-hash", nil); err == nil {
		t.Fatal("key reuse with different inputs accepted")
	}
	if _, yes, err := beginCoverFeed(ctx, db, "other", "unique-key", "样张", "model", "hash", nil); err != nil || !yes {
		t.Fatalf("workspace isolation %v %v", yes, err)
	}
	learningExec(t, db, `UPDATE "CoverMemorySample" SET "updatedAt"='2000-01-01T00:00:00Z' WHERE "workspaceId"='local'`)
	if err := recoverStaleCoverFeeds(ctx, db, "local"); err != nil {
		t.Fatal(err)
	}
	for _, workspace := range []string{"local", "other"} {
		var status string
		if err := db.QueryRow(`SELECT "status" FROM "CoverMemorySample" WHERE "workspaceId"=?`, workspace).Scan(&status); err != nil {
			t.Fatal(err)
		}
		expected := "running"
		if workspace == "local" {
			expected = "failed"
		}
		if status != expected {
			t.Fatalf("%s %s", workspace, status)
		}
	}
}

func TestFeedCancellationAndReplayNeverRepeatModel(t *testing.T) {
	cfg := coverMemoryConfig(t)
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	defer once.Do(func() { close(release) })
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(entered)
		<-release
		raw, _ := json.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": `{"layout":{"rule":"保留真实表盘","evidence":"中央"}}`}}}})
		_, _ = w.Write(raw)
	}))
	defer func() { once.Do(func() { close(release) }); server.Close() }()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	payload := fmt.Sprintf(`{"imageUrls":[%q],"model":"model","title":"手表","requestKey":"same-request-key","textProtocol":"openai","customApiKey":"test-key","customBaseUrl":%q}`, learningImage, server.URL)
	handler := HeadlineDeconstruct(cfg)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(payload)).WithContext(ctx))
	}()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("model not called")
	}
	cancel()
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(payload)))
	if duplicate.Code != 409 || !strings.Contains(duplicate.Body.String(), `"uncertain":true`) {
		t.Fatalf("running replay %d %s", duplicate.Code, duplicate.Body.String())
	}
	once.Do(func() { close(release) })
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("handler did not finish")
	}
	if rec.Code != 200 {
		t.Fatalf("cancelled completion %d %s", rec.Code, rec.Body.String())
	}
	replay := httptest.NewRecorder()
	handler.ServeHTTP(replay, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(payload)))
	if replay.Code != 200 || !strings.Contains(replay.Body.String(), `"replayed":true`) || calls.Load() != 1 {
		t.Fatalf("replay %d calls %d %s", replay.Code, calls.Load(), replay.Body.String())
	}
}

func TestFeedFailureCleanupSurvivesCancelledRequest(t *testing.T) {
	cfg := coverMemoryConfig(t)
	db, ok := openCoverDB(cfg)
	if !ok {
		t.Fatal("db")
	}
	defer db.Close()
	if err := insertCoverSample(t.Context(), db, "local", "sample", "title", "model", nil); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	markCoverSample(httptest.NewRequest(http.MethodPost, "/", nil).WithContext(ctx), cfg, "local", "sample", "failed", "", "模型异常")
	var status string
	if err := db.QueryRow(`SELECT "status" FROM "CoverMemorySample" WHERE "id"='sample'`).Scan(&status); err != nil || status != "failed" {
		t.Fatalf("orphan %s %v", status, err)
	}
}

func TestHeadlineImagesReadLocalUploadsWithoutHTTP(t *testing.T) {
	root := t.TempDir()
	t.Setenv("AZHUO_CACHE_DIR", root)
	workspace := strings.Repeat("a", 64)
	if err := os.MkdirAll(filepath.Join(root, workspace), 0700); err != nil {
		t.Fatal(err)
	}
	raw, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err := os.WriteFile(filepath.Join(root, workspace, "原图.png"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "http://localhost:3000/api/generate/headline-title", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	for _, source := range []string{"/storage/" + workspace + "/原图.png", "http://127.0.0.1:5173/storage/" + workspace + "/%E5%8E%9F%E5%9B%BE.png?exp=1"} {
		images, message := headlineImages(config.Config{}, r, []string{source})
		if message != "" || len(images) != 1 || !strings.HasPrefix(images[0], "data:image/png;base64,") {
			t.Fatalf("local upload was not embedded: %q %s", images, message)
		}
	}
	for _, source := range []string{"/storage/other/原图.png", "/storage/" + workspace + "/../原图.png", "/storage/" + workspace + "/missing.png"} {
		if _, message := headlineImages(config.Config{}, r, []string{source}); message == "" {
			t.Fatalf("invalid local source accepted: %s", source)
		}
	}
}

func TestHeadlineImagePreflightIncludesRetailHeaders(t *testing.T) {
	old := gateway.ModelHTTP
	defer func() { gateway.ModelHTTP = old }()
	gateway.ModelHTTP = func() *http.Client {
		return &http.Client{Transport: headlineImageTransport(func(r *http.Request) (*http.Response, error) {
			if r.Header.Get("Referer") != "https://www.taobao.com/" || r.Header.Get("User-Agent") == "" {
				t.Error("retail image request omitted anti-hotlink headers")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("image")), Header: make(http.Header)}, nil
		})}
	}
	source := "https://img.alicdn.com/product.png?signature=abc"
	images, message := headlineImages(config.Config{}, httptest.NewRequest(http.MethodPost, "/", nil), []string{source})
	if message != "" || len(images) != 1 || images[0] != source {
		t.Fatalf("remote image changed: %q %s", images, message)
	}
}

type headlineImageTransport func(*http.Request) (*http.Response, error)

func (f headlineImageTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func headlineReceiptConfig(t *testing.T, cfg config.Config) config.Config {
	t.Helper()
	if cfg.DatabaseURL == "" && cfg.DatabasePath == "" {
		cfg.DatabaseURL = coverMemoryConfig(t).DatabaseURL
	}
	db, err := database.OpenWrite(cfg.SQLiteFile())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	raw, err := os.ReadFile(filepath.Join("..", "..", "platform", "database", "migrate", "sources", "generation_submissions.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(strings.Replace(string(raw), `CREATE TABLE "GenerationSubmission"`, `CREATE TABLE IF NOT EXISTS "GenerationSubmission"`, 1)); err != nil {
		t.Fatal(err)
	}
	return cfg
}

func headlineTitleTestHandler(t *testing.T, cfg config.Config) http.Handler {
	return HeadlineTitle(headlineReceiptConfig(t, cfg))
}

func headlineDesignTestHandler(t *testing.T, cfg config.Config) http.Handler {
	return HeadlineDesign(headlineReceiptConfig(t, cfg))
}
