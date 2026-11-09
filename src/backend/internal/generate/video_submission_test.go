package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func videoSubmissionTestConfig(t *testing.T, server *httptest.Server) config.Config {
	t.Helper()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	path := filepath.Join(t.TempDir(), "video-receipts.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE "ImageTask" (
        "routeFingerprint" TEXT NOT NULL DEFAULT '',
		"id" TEXT PRIMARY KEY, "workspaceId" TEXT, "productId" TEXT, "prompt" TEXT, "taskId" TEXT, "status" TEXT,
		"resultUrl" TEXT, "failReason" TEXT, "model" TEXT, "mediaType" TEXT, "size" TEXT, "quality" TEXT,
		"idempotencyKey" TEXT, "createdAt" TEXT, "updatedAt" TEXT
	)`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(submissionSchemaForTest(t)); err != nil {
		t.Fatal(err)
	}
	return config.Config{DatabaseURL: "file:" + path, NodeEnv: "development"}
}

func videoSubmissionTestPost(handler http.Handler, base, key, prompt, workspace string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]any{
		"prompt": prompt, "model": "veo3.1", "duration": 8, "customApiKey": "secret", "customBaseUrl": base, "clientTaskId": key,
	})
	r := httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body)))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	r.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func videoSubmissionTestGet(handler http.Handler, key, workspace string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskKey="+url.QueryEscape(key), nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestVideoSubmissionConcurrentClaimAndConflict(t *testing.T) {
	var calls atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	var cfg config.Config
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)
		row, err := lookupVideoSubmission(cfg, r, "concurrent")
		if err != nil || !row.found || !imageTaskStillSubmitting(row.taskID) {
			t.Errorf("receipt must be persisted before upstream request: %+v %v", row, err)
		}
		if call == 1 {
			close(started)
			<-release
		}
		_, _ = w.Write([]byte(`{"task_id":"video-original"}`))
	}))
	defer server.Close()
	cfg = videoSubmissionTestConfig(t, server)
	handler := Video(cfg)
	first := make(chan *httptest.ResponseRecorder, 1)
	go func() { first <- videoSubmissionTestPost(handler, server.URL, "concurrent", "海边", "local") }()
	<-started
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			response := videoSubmissionTestPost(handler, server.URL, "concurrent", "海边", "local")
			if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), `"submissionUnknown":true`) {
				t.Errorf("duplicate in flight: %d %s", response.Code, response.Body.String())
			}
		}()
	}
	wg.Wait()
	conflict := videoSubmissionTestPost(handler, server.URL, "concurrent", "different", "local")
	close(release)
	created := <-first
	if conflict.Code != http.StatusConflict || created.Code != http.StatusOK || calls.Load() != 1 {
		t.Fatalf("conflict=%d created=%d calls=%d; %s", conflict.Code, created.Code, calls.Load(), created.Body.String())
	}
	repeated := videoSubmissionTestPost(Video(cfg), server.URL, "concurrent", "海边", "local")
	if repeated.Code != http.StatusOK || !strings.Contains(repeated.Body.String(), `"taskId":"video-original"`) || calls.Load() != 1 {
		t.Fatalf("accepted duplicate: %d %s calls=%d", repeated.Code, repeated.Body.String(), calls.Load())
	}
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	_ = db.QueryRow(`SELECT count(*) FROM "ImageTask"`).Scan(&count)
	if count != 1 {
		t.Fatalf("receipt count=%d", count)
	}
	// Finishing the task must not destroy the immutable request fingerprint.
	updateTaskTerminal(context.Background(), db, taskScope{workspace: "local", media: "video"}, "video-original", "SUCCESS", "https://cdn.example/video.mp4", "", "")
	conflict = videoSubmissionTestPost(handler, server.URL, "concurrent", "changed after success", "local")
	if conflict.Code != http.StatusConflict || calls.Load() != 1 {
		t.Fatalf("terminal conflict: %d %s", conflict.Code, conflict.Body.String())
	}
}

func TestVideoSubmissionReceiptRecoversLostResponseAndIsolatesWorkspace(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprintf(w, `{"task_id":"video-%d"}`, calls.Add(1))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	// Treat the first HTTP response as lost. A fresh handler has no in-memory claim.
	_ = videoSubmissionTestPost(Video(cfg), server.URL, "same-key", "海边", "workspace-a")
	recovered := videoSubmissionTestGet(Video(cfg), "same-key", "workspace-a")
	if recovered.Code != http.StatusOK || !strings.Contains(recovered.Body.String(), `"taskId":"video-1"`) || !strings.Contains(recovered.Body.String(), `"submissionOutcome":"accepted"`) {
		t.Fatalf("recovered receipt: %d %s", recovered.Code, recovered.Body.String())
	}
	hidden := videoSubmissionTestGet(Video(cfg), "same-key", "workspace-b")
	if strings.Contains(hidden.Body.String(), "video-1") || !strings.Contains(hidden.Body.String(), "QUERY_FAILED") {
		t.Fatalf("cross-workspace leak: %s", hidden.Body.String())
	}
	created := videoSubmissionTestPost(Video(cfg), server.URL, "same-key", "different parameters", "workspace-b")
	if created.Code != http.StatusOK || !strings.Contains(created.Body.String(), `"taskId":"video-2"`) || calls.Load() != 2 {
		t.Fatalf("independent workspace: %d %s", created.Code, created.Body.String())
	}
}

func TestVideoPromptLimitsCountUnicodeAndPreserveWholeText(t *testing.T) {
	for _, item := range []struct {
		model string
		limit int
	}{
		{"MiniMax-H3", 7000}, {"h3", 7000},
		{"wan3.0-video", 20000}, {"wan3.0-video-prime", 20000},
	} {
		t.Run(item.model, func(t *testing.T) {
			prompt := strings.Repeat("衣", item.limit-1) + "🙂"
			payload := map[string]json.RawMessage{"prompt": rawJSON(t, prompt), "preserve_prompt": rawJSON(t, true)}
			if message := videoPromptInputError(payload, item.model); message != "" {
				t.Fatal(message)
			}
			payload["prompt"] = rawJSON(t, prompt+"尾")
			if message := videoPromptInputError(payload, item.model); !strings.Contains(message, "请精简") {
				t.Fatalf("overlong prompt was accepted: %s", message)
			}
		})
	}
}

func TestH3PromptLimitIncludesAdapterWrittenSilence(t *testing.T) {
	payload := map[string]json.RawMessage{"prompt": rawJSON(t, strings.Repeat("衣", 7000)), "audio": rawJSON(t, false)}
	if message := videoPromptInputError(payload, "MiniMax-H3"); message == "" {
		t.Fatal("adapter silence text bypassed the provider's limit")
	}
	payload["preserve_prompt"] = rawJSON(t, true)
	if message := videoPromptInputError(payload, "MiniMax-H3"); message != "" {
		t.Fatal(message)
	}
}

func TestOverlongVideoPromptRejectsBeforeStorageOrUpstream(t *testing.T) {
	for _, model := range []string{"MiniMax-H3", "wan3.0-video"} {
		body, _ := json.Marshal(map[string]any{
			"model": model, "prompt": strings.Repeat("衣", 20001), "preserve_prompt": true,
			"ref_mode": "omni", "images": []string{"/storage/local/missing.png"},
		})
		response := httptest.NewRecorder()
		Video(config.Config{}).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body))))
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "提示词最多") {
			t.Fatalf("model=%s status=%d body=%s", model, response.Code, response.Body.String())
		}
	}
}

func TestWanSeedRetainsZeroAndRandomSentinel(t *testing.T) {
	for _, seed := range []int64{-1, 0, 42, 2147483647} {
		payload := map[string]json.RawMessage{"seed": rawJSON(t, seed)}
		if message := videoSeedInputError(payload, "wan3.0-video"); message != "" {
			t.Fatal(message)
		}
		body := buildVideoPayload("wan3.0-video", "展示衣服", payload).payload
		if got := body["parameters"].(map[string]any)["seed"]; got != seed {
			t.Fatalf("seed changed: got=%v want=%v", got, seed)
		}
	}
	for _, seed := range []int64{-2, 2147483648} {
		if message := videoSeedInputError(map[string]json.RawMessage{"seed": rawJSON(t, seed)}, "wan3.0-video"); message == "" {
			t.Fatalf("invalid seed accepted: %d", seed)
		}
	}
	body := buildVideoPayload("wan3.0-video", "展示衣服", nil).payload
	if _, exists := body["parameters"].(map[string]any)["seed"]; exists {
		t.Fatal("unspecified seed was introduced")
	}
}

func TestVideoPreservePromptOnlyChangesOptedInAdapterPolicy(t *testing.T) {
	const prompt = "当前模板：\n商品参考 图片1，保留「自然动作」。"
	for _, preserve := range []string{"absent", "false", "true"} {
		t.Run(preserve, func(t *testing.T) {
			payload := map[string]json.RawMessage{"audio": rawJSON(t, false)}
			if preserve != "absent" {
				payload["preserve_prompt"] = json.RawMessage(preserve)
			}
			minimax := buildVideoPayload("MiniMax-H3", prompt, payload).payload
			minimaxText := minimax["content"].([]map[string]any)[0]["text"]
			wan := buildVideoPayload("wan3.0-video", prompt, payload).payload
			parameters := wan["parameters"].(map[string]any)
			if preserve == "true" {
				if minimaxText != prompt || parameters["prompt_extend"] != false {
					t.Fatalf("managed prompt changed: minimax=%#v wan=%#v", minimax, wan)
				}
			} else if minimaxText != prompt+" (silent video, no sound)" || parameters["prompt_extend"] != true {
				t.Fatalf("default adapter behavior changed: minimax=%#v wan=%#v", minimax, wan)
			}
			if wan["input"].(map[string]any)["prompt"] != prompt || parameters["audio"] != false {
				t.Fatalf("prompt/audio intent lost: %#v", wan)
			}
			if minimax["preserve_prompt"] != nil || wan["preserve_prompt"] != nil {
				t.Fatal("local transport flag reached provider")
			}
		})
	}
}

func TestVideoPreservePromptRetainsFinalTextThroughSubmission(t *testing.T) {
	const prompt = "  当前模板：\n商品参考 图片1，保留「自然动作」。\n"
	for _, model := range []string{"MiniMax-H3", "wan3.0-video", "doubao-seedance-2.5"} {
		t.Run(model, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
					http.Error(w, "invalid payload", http.StatusBadRequest)
					return
				}
				var text any
				switch model {
				case "wan3.0-video":
					text = body["input"].(map[string]any)["prompt"]
					if body["parameters"].(map[string]any)["prompt_extend"] != false {
						t.Error("upstream prompt rewriting is enabled")
					}
				case "doubao-seedance-2.5":
					text = body["content"].([]any)[0].(map[string]any)["text"]
				default:
					text = body["prompt"]
				}
				if text != prompt || body["preserve_prompt"] != nil {
					t.Errorf("outbound text=%q flag=%v", text, body["preserve_prompt"])
				}
				_, _ = w.Write([]byte(`{"task_id":"preserved-video"}`))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			body, _ := json.Marshal(map[string]any{
				"prompt": prompt, "preserve_prompt": true, "model": model, "duration": 5,
				"resolution": "720P", "ref_mode": "text", "audio": false,
				"customBaseUrl": server.URL, "customApiKey": "test-key", "clientTaskId": "preserve-prompt",
			})
			response := httptest.NewRecorder()
			Video(cfg).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/generate/video", strings.NewReader(string(body))))
			if response.Code != http.StatusOK || calls != 1 {
				t.Fatalf("status=%d calls=%d body=%s", response.Code, calls, response.Body.String())
			}
		})
	}
}

func TestVideoPreservePromptRejectsNonBooleanValues(t *testing.T) {
	for _, value := range []string{`"true"`, `null`, `1`, `{}`} {
		if message := videoBodyError(map[string]json.RawMessage{
			"prompt": rawJSON(t, "当前模板"), "preserve_prompt": json.RawMessage(value),
		}); !strings.Contains(message, "Expected boolean") {
			t.Fatalf("value=%s message=%s", value, message)
		}
	}
}
