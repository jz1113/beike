package generate

import (
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestP2OngoingUsageSurvivesDisconnectRestartAndEmptyTerminal(t *testing.T) {
	s := httptest.NewServer(http.NotFoundHandler())
	defer s.Close()
	cfg := videoSubmissionTestConfig(t, s)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT; INSERT INTO "ImageTask" (id,workspaceId,mediaType,taskId,status) VALUES ('owned','owner','video','same','IN_PROGRESS'),('other','other','video','same','IN_PROGRESS'),('image','owner','image','same','IN_PROGRESS')`)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	body := polledTaskBody(ctx, cfg, taskScope{workspace: "owner", media: "video"}, "same", pollParsed{status: "IN_PROGRESS"}, map[string]any{"usage": map[string]any{"prompt_tokens": 5}})
	if body["usage"] == nil {
		t.Fatal("observed usage dropped", body)
	}
	raw := readTaskUsage(t.Context(), db, taskScope{workspace: "owner", media: "video"}, "same")
	if gateway.DecodeUsage(raw) == nil {
		t.Fatal("ongoing usage was not persisted", raw)
	}
	body = polledTaskBody(t.Context(), cfg, taskScope{workspace: "owner", media: "video"}, "same", pollParsed{status: "SUCCESS", result: "/original.mp4"}, nil)
	if body["usage"] == nil {
		t.Fatal("terminal without usage lost durable usage", body)
	}
	var unrelated int
	if err = db.QueryRow(`SELECT COUNT(*) FROM "ImageTask" WHERE id!='owned' AND usage IS NOT NULL`).Scan(&unrelated); err != nil || unrelated != 0 {
		t.Fatal(unrelated, err)
	}
}

func TestP2ImageHTTPUsageSurvivesPartialUpdatesRestartAndReplay(t *testing.T) {
	var stage atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			w.Write([]byte(`{"task_id":"usage-original"}`))
			return
		}
		switch stage.Add(1) {
		case 1:
			w.Write([]byte(`{"status":"IN_PROGRESS","usage":{"prompt_tokens":5}}`))
		case 2:
			w.Write([]byte(`{"status":"IN_PROGRESS","usage":{"completion_tokens":7,"total_tokens":12}}`))
		default:
			w.Write([]byte(`{"status":"SUCCESS","url":"https://media.example/original.png"}`))
		}
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	raw := `{"prompt":"test","model":"gpt-image-2","clientTaskId":"usage-key","customApiKey":"fake","customBaseUrl":"` + server.URL + `"}`
	post := func() map[string]any {
		t.Helper()
		w := httptest.NewRecorder()
		request := httptest.NewRequest("POST", "/api/generate/image", strings.NewReader(raw))
		request.Header.Set("x-idempotency-key", "usage-key")
		Image(cfg).ServeHTTP(w, request)
		var body map[string]any
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return body
	}
	initial := post()
	for i, want := range []float64{5, 12, 12} {
		r := httptest.NewRequest("GET", "/api/generate/image?taskId=usage-original&model=gpt-image-2", nil)
		r.Header.Set("x-custom-base-url", server.URL)
		r.Header.Set("x-custom-api-key", "fake")
		w := httptest.NewRecorder()
		Image(cfg).ServeHTTP(w, r)
		var body map[string]any
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		if usage := body["usage"].(map[string]any); usage["totalTokens"] != want || body["recordId"] != initial["recordId"] {
			t.Fatal(i, body)
		}
	}
	server.Close()
	w := httptest.NewRecorder()
	Image(cfg).ServeHTTP(w, httptest.NewRequest("GET", "/api/generate/image?taskKey=usage-key", nil))
	var recovered map[string]any
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &recovered) != nil || gateway.NormalizeUsage(recovered) == nil || gateway.NormalizeUsage(recovered)["totalTokens"] != float64(12) || stage.Load() != 3 {
		t.Fatal(w.Code, w.Body.String(), stage.Load())
	}
	if replay := post(); replay["usage"].(map[string]any)["totalTokens"] != float64(12) {
		t.Fatal(replay)
	}
}

func TestP2UsageMergeIsCumulativeConcurrentAndRecordScoped(t *testing.T) {
	s := httptest.NewServer(http.NotFoundHandler())
	defer s.Close()
	cfg := videoSubmissionTestConfig(t, s)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT; INSERT INTO "ImageTask" (id,workspaceId,mediaType,taskId,status) VALUES ('channel-a','local','image','same','IN_PROGRESS'),('channel-b','local','image','same','IN_PROGRESS')`); err != nil {
		t.Fatal(err)
	}
	scope := taskScope{workspace: "local", media: "image", recordID: "channel-a"}
	var group sync.WaitGroup
	for i := 1; i <= 12; i++ {
		group.Add(1)
		go func(n int) {
			defer group.Done()
			_, err := mergeTaskUsage(t.Context(), db, scope, "same", gateway.NormalizeUsage(map[string]any{"usage": map[string]any{"prompt_tokens": 5, "completion_tokens": n, "total_tokens": 5 + n}}))
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	group.Wait()
	body := polledTaskBody(t.Context(), cfg, scope, "same", pollParsed{status: "SUCCESS", result: "/a.png"}, map[string]any{"usage": map[string]any{"total_tokens": 3}})
	usage := body["usage"].(map[string]any)
	if usage["totalTokens"] != float64(17) || usage["promptTokens"] != float64(5) || usage["completionTokens"] != float64(12) {
		t.Fatal(body)
	}
	if raw := readTaskUsage(t.Context(), db, taskScope{workspace: "local", media: "image", recordID: "channel-b"}, "same"); raw != "" {
		t.Fatal("other channel was charged", raw)
	}
	// Without the immutable record ID, the API cannot guess which channel owns it.
	r := httptest.NewRequest("GET", "/?taskId=same", nil)
	w := httptest.NewRecorder()
	if authorizeTaskPoll(cfg, w, r, "image", "same") || w.Code != 409 {
		t.Fatal("ambiguous task was accepted", w.Code)
	}
	r.Header.Set("x-task-record-id", "channel-a")
	w = httptest.NewRecorder()
	if !authorizeTaskPoll(cfg, w, r, "image", "same") {
		t.Fatal(w.Code, w.Body.String())
	}
	r.Header.Set("x-task-record-id", "unowned")
	w = httptest.NewRecorder()
	if authorizeTaskPoll(cfg, w, r, "image", "same") {
		t.Fatal("unowned record was accepted")
	}
}

func TestP2UsageWriteFailureKeepsObservedReceiptAndReportsUnconfirmedPersistence(t *testing.T) {
	s := httptest.NewServer(http.NotFoundHandler())
	defer s.Close()
	cfg := videoSubmissionTestConfig(t, s)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT; INSERT INTO "ImageTask" (id,workspaceId,mediaType,taskId,status) VALUES ('receipt','local','image','task','IN_PROGRESS'); CREATE TRIGGER no_usage BEFORE UPDATE OF "usage" ON "ImageTask" BEGIN SELECT RAISE(ABORT,'full'); END;`)
	if err != nil {
		t.Fatal(err)
	}
	body := polledTaskBody(t.Context(), cfg, taskScope{workspace: "local", media: "image", recordID: "receipt"}, "task", pollParsed{status: "IN_PROGRESS"}, map[string]any{"usage": map[string]any{"total_tokens": 7}})
	if body["usage"] == nil || body["usagePersisted"] != false || body["usagePersistenceError"] == nil {
		t.Fatal("storage failure hid observed usage", body)
	}
}

func TestP2ImageFailedKeyRecoveryIncludesStoredUsageAndIdentity(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method == "POST" {
			w.Write([]byte(`{"task_id":"charged-image"}`))
			return
		}
		w.Write([]byte(`{"status":"FAILURE","fail_reason":"paid failure","usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12}}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	// The original tab loses its first response; another observer settles the charged failure.
	post := imageSubmissionPost(Image(cfg), server.URL, "lost-first-receipt", "test", "owner")
	var initial map[string]any
	if post.Code != 200 || json.Unmarshal(post.Body.Bytes(), &initial) != nil {
		t.Fatal(post.Code, post.Body.String())
	}
	query := func(path string) map[string]any {
		t.Helper()
		r := httptest.NewRequest("GET", path, nil)
		r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
		r.Header.Set("x-custom-base-url", server.URL)
		r.Header.Set("x-custom-api-key", "test-only")
		w := httptest.NewRecorder()
		Image(cfg).ServeHTTP(w, r)
		var body map[string]any
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
			t.Fatal(w.Code, w.Body.String())
		}
		return body
	}
	failed := query("/api/generate/image?taskId=charged-image&model=gpt-image-2")
	if failed["status"] != "FAILURE" || gateway.NormalizeUsage(failed) == nil {
		t.Fatal(failed)
	}
	server.Close()
	for i := 0; i < 2; i++ {
		restored := query("/api/generate/image?taskKey=lost-first-receipt&closeMissing=true")
		if restored["status"] != "FAILURE" || restored["taskId"] != "charged-image" || restored["recordId"] != initial["recordId"] || gateway.NormalizeUsage(restored) == nil || gateway.NormalizeUsage(restored)["totalTokens"] != float64(12) {
			t.Fatal(restored)
		}
	}
	if calls.Load() != 2 {
		t.Fatalf("terminal recovery called upstream: %d", calls.Load())
	}
}
