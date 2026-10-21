package generate

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database/migrate"
)

func TestNestedVideoPromptPersistsBeforeUpstream(t *testing.T) {
	var calls atomic.Int32
	var sawSeedance, sawWan atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Errorf("upstream body")
			http.Error(w, "bad", http.StatusBadRequest)
			return
		}
		calls.Add(1)
		switch {
		case strings.Contains(r.URL.Path, "/contents/generations/tasks"):
			content, _ := body["content"].([]any)
			if body["prompt"] != nil || len(content) == 0 {
				t.Errorf("seedance body %#v", body)
			}
			sawSeedance.Store(true)
		case strings.Contains(r.URL.Path, "/video-synthesis"):
			input, _ := body["input"].(map[string]any)
			if body["prompt"] != nil || input["prompt"] != "展示卫衣" {
				t.Errorf("wan body %#v", body)
			}
			sawWan.Store(true)
		default:
			t.Errorf("unexpected endpoint %s", r.URL.Path)
		}
		_, _ = fmt.Fprintf(w, `{"task_id":"upstream-%d"}`, calls.Load())
	}))
	defer server.Close()
	previous := ModelHTTP
	ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { ModelHTTP = previous })

	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "video-sales.db")
	if err := migrate.Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{DatabaseURL: "file:" + path, NodeEnv: "development", Root: root}
	handler := Video(cfg)
	for index, item := range []struct {
		model, key string
	}{
		{"doubao-seedance-2.5", "seedance-receipt"},
		{"wan3.0-video", "wan-receipt"},
	} {
		body, _ := json.Marshal(map[string]any{
			"prompt": "展示卫衣", "model": item.model, "duration": 15, "aspect_ratio": "9:16",
			"resolution": "480P", "ref_mode": "omni", "audio": true,
			"images":        []string{"https://example.com/front.jpg"},
			"customBaseUrl": server.URL, "customApiKey": "secret", "clientTaskId": item.key,
		})
		request := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body)))
		request = request.WithContext(httpx.WithWorkspace(request.Context(), "local"))
		request.Header.Set("x-idempotency-key", item.key)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		taskID := fmt.Sprintf("upstream-%d", index+1)
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"taskId":"`+taskID+`"`) {
			t.Fatalf("%s status %d %s", item.model, response.Code, response.Body.String())
		}
		db, err := openTaskDB(cfg)
		if err != nil {
			t.Fatal(err)
		}
		var prompt, storedTask string
		err = db.QueryRow(`SELECT "prompt", "taskId" FROM "ImageTask" WHERE "idempotencyKey" = ?`, item.key).Scan(&prompt, &storedTask)
		_ = db.Close()
		if err != nil || prompt != "展示卫衣" || storedTask != taskID {
			t.Fatalf("%s stored prompt %q task %q err %v", item.model, prompt, storedTask, err)
		}
	}
	if calls.Load() != 2 || !sawSeedance.Load() || !sawWan.Load() {
		t.Fatalf("calls %d seedance %v wan %v", calls.Load(), sawSeedance.Load(), sawWan.Load())
	}
}
