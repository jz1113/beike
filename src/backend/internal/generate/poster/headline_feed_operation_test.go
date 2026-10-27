package poster

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/generate"
)

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
	previous := generate.ModelHTTP
	generate.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { generate.ModelHTTP = previous })
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
