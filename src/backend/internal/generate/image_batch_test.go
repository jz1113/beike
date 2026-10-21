package generate

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

func TestImageBatchSubmitsTogetherAndKeepsSiblingReceipt(t *testing.T) {
	var mu sync.Mutex
	active, maxActive := 0, 0
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		prompt, _ := payload["prompt"].(string)
		if prompt == "坏的" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"尺寸不合法"}}`))
			return
		}
		mu.Lock()
		active++
		if active > maxActive {
			maxActive = active
		}
		mu.Unlock()
		started <- struct{}{}
		<-release
		mu.Lock()
		active--
		mu.Unlock()
		_, _ = w.Write([]byte(`{"task_id":"task-` + prompt + `"}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := ImageBatch(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	body := `{"items":[` + imageBatchItem("left", "左图", "idem-left", server.URL) + `,` + imageBatchItem("right", "右图", "idem-right", server.URL) + `]}`
	response := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image-batch", strings.NewReader(body)))
		close(done)
	}()
	for range 2 {
		select {
		case <-started:
		case <-time.After(5 * time.Second):
			t.Fatal("upstream submissions did not overlap")
		}
	}
	if maxActive < 2 {
		t.Fatalf("max active %d", maxActive)
	}
	close(release)
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("batch did not finish")
	}
	text := response.Body.String()
	if response.Code != http.StatusOK || !strings.Contains(text, `"taskId":"task-左图"`) || !strings.Contains(text, `"taskId":"task-右图"`) {
		t.Fatalf("batch %d %s", response.Code, text)
	}

	failed := httptest.NewRecorder()
	mixed := `{"items":[` + imageBatchItem("bad", "坏的", "idem-bad", server.URL) + `,` + imageBatchItem("ok", "好的", "idem-ok", server.URL) + `]}`
	handler.ServeHTTP(failed, httptest.NewRequest(http.MethodPost, "/api/generate/image-batch", strings.NewReader(mixed)))
	mixedText := failed.Body.String()
	if failed.Code != http.StatusOK || !strings.Contains(mixedText, "尺寸不合法") || !strings.Contains(mixedText, `"taskId":"task-好的"`) || !strings.Contains(mixedText, `"id":"bad"`) {
		t.Fatalf("mixed %d %s", failed.Code, mixedText)
	}
}

func TestImageBatchRejectsTwentyOne(t *testing.T) {
	items := make([]string, 21)
	for index := range items {
		items[index] = imageBatchItem(fmt.Sprintf("a%d", index), "一只猫", "", "https://ai.comfly.org")
	}
	handler := ImageBatch(config.Config{Upstream: "http://127.0.0.1:1", NodeEnv: "development"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/image-batch", strings.NewReader(`{"items":[`+strings.Join(items, ",")+`]}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "一批最多提交 20 张图片") {
		t.Fatalf("limit %d %s", response.Code, response.Body.String())
	}
}

func TestImageBatchReusesIdempotencyKey(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		_, _ = w.Write([]byte(`{"data":[{"url":"https://cdn.example.com/reused.jpg"}]}`))
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })
	handler := ImageBatch(config.Config{Upstream: "http://127.0.0.1:1", DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	item := imageBatchItem("once", "一只猫", "idem-reuse", server.URL)
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(http.MethodPost, "/api/generate/image-batch", strings.NewReader(`{"items":[`+item+`]}`)))
	if first.Code != http.StatusOK || !strings.Contains(first.Body.String(), "https://cdn.example.com/reused.jpg") {
		t.Fatalf("first %d %s", first.Code, first.Body.String())
	}
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, httptest.NewRequest(http.MethodPost, "/api/generate/image-batch", strings.NewReader(`{"items":[`+item+`]}`)))
	text := second.Body.String()
	if second.Code != http.StatusOK || hits != 1 || !strings.Contains(text, `"reused":true`) || !strings.Contains(text, "https://cdn.example.com/reused.jpg") {
		t.Fatalf("reuse hits %d %d %s", hits, second.Code, text)
	}
}

func imageBatchItem(id, prompt, key, base string) string {
	payload := map[string]any{
		"id": id, "prompt": prompt, "model": "gpt-image-2", "idempotencyKey": key,
		"customApiKey": "secret", "customBaseUrl": base,
	}
	raw, _ := json.Marshal(payload)
	return string(raw)
}
