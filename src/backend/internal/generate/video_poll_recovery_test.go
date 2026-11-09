package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestWanVideoQueryErrorsPreserveOriginalTask(t *testing.T) {
	cases := []struct {
		name, upstream, responseStatus string
	}{
		{"query error object", `{"error":{"message":"temporary query failure"}}`, "QUERY_FAILED"},
		{"query error text", `{"error":"temporary query failure"}`, "QUERY_FAILED"},
		{"empty output with query error", `{"output":{},"error":{"message":"temporary query failure"}}`, "QUERY_FAILED"},
		{"running task with query warning", `{"output":{"task_status":"RUNNING"},"error":{"message":"temporary query failure"}}`, "IN_PROGRESS"},
		{"running task with text warning", `{"output":{"task_status":"RUNNING"},"error":"temporary query failure"}`, "IN_PROGRESS"},
		{"pending task with preview", `{"output":{"task_status":"PENDING","url":"https://cdn.example/preview.mp4"}}`, "IN_PROGRESS"},
		{"submitted task with preview", `{"status":"SUBMITTED","url":"https://cdn.example/preview.mp4"}`, "IN_PROGRESS"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var upstream atomic.Value
			upstream.Store(item.upstream)
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				_, _ = w.Write([]byte(upstream.Load().(string)))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			_, err = insertImageTask(context.Background(), db, "local", imageTaskDraft{
				TaskID: "wan-original", Model: "wan3.0-video", Status: "IN_PROGRESS", MediaType: "video",
			})
			if err != nil {
				t.Fatal(err)
			}
			poll := func() map[string]any {
				t.Helper()
				request := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=wan-original&model=wan3.0-video", nil)
				request.Header.Set("x-custom-base-url", server.URL)
				request.Header.Set("x-custom-api-key", "secret")
				requestBase, requestKey := pollCredentials(cfg, request)
				route, _ := json.Marshal(videoTaskRoute{Digest: videoRouteDigest(requestBase, requestKey, "wan3.0-video", request)})
				if _, err := db.Exec(`UPDATE "ImageTask" SET "routeFingerprint"=? WHERE "mediaType"='video'`, string(route)); err != nil {
					t.Fatal(err)
				}
				response := httptest.NewRecorder()
				Video(cfg).ServeHTTP(response, request)
				var body map[string]any
				if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &body) != nil {
					t.Fatalf("poll: %d %s", response.Code, response.Body.String())
				}
				return body
			}
			body := poll()
			if body["status"] != item.responseStatus || (item.responseStatus == "QUERY_FAILED" && body["retryable"] != true) {
				t.Fatalf("query error became terminal: %v", body)
			}
			status, result, reason, _, found, err := taskStatus(context.Background(), db, taskScope{workspace: "local", media: "video"}, "wan-original")
			if err != nil || !found || status != "IN_PROGRESS" || result != "" || reason != "" {
				t.Fatalf("original task changed: status=%s result=%s reason=%s found=%v err=%v", status, result, reason, found, err)
			}
			beforeRecovery := calls.Load()
			upstream.Store(`{"output":{"task_status":"SUCCEEDED","video_url":"https://cdn.example/wan.mp4"}}`)
			body = poll()
			if body["status"] != "SUCCESS" || body["resultUrl"] != "https://cdn.example/wan.mp4" || calls.Load() <= beforeRecovery {
				t.Fatalf("original task could not recover: %v calls=%d", body, calls.Load())
			}
			status, result, _, _, _, err = taskStatus(context.Background(), db, taskScope{workspace: "local", media: "video"}, "wan-original")
			if err != nil || status != "SUCCESS" || result != "https://cdn.example/wan.mp4" {
				t.Fatalf("completion not saved: status=%s result=%s err=%v", status, result, err)
			}
		})
	}
}

func TestVideoPollErrorsRespectExplicitTerminalEvidence(t *testing.T) {
	for _, item := range []struct {
		name, upstream, status, result, reason string
	}{
		{"nested failure with error object", `{"output":{"task_status":"FAILED"},"error":{"message":"render rejected"}}`, "FAILURE", "", "render rejected"},
		{"nested failure with error text", `{"output":{"task_status":"FAILED"},"error":"render rejected"}`, "FAILURE", "", "render rejected"},
		{"nested success with error object", `{"output":{"task_status":"SUCCEEDED","video_url":"https://cdn.example/done.mp4"},"error":{"message":"query warning"}}`, "SUCCESS", "https://cdn.example/done.mp4", ""},
		{"result with error text", `{"video_url":"https://cdn.example/done.mp4","error":"query warning"}`, "SUCCESS", "https://cdn.example/done.mp4", ""},
	} {
		t.Run(item.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(item.upstream))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			_, err = insertImageTask(context.Background(), db, "local", imageTaskDraft{TaskID: "wan-terminal", Status: "IN_PROGRESS", MediaType: "video"})
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=wan-terminal&model=wan3.0-video", nil)
			request.Header.Set("x-custom-base-url", server.URL)
			requestBase, requestKey := pollCredentials(cfg, request)
			route, _ := json.Marshal(videoTaskRoute{Digest: videoRouteDigest(requestBase, requestKey, "wan3.0-video", request)})
			if _, err := db.Exec(`UPDATE "ImageTask" SET "routeFingerprint"=? WHERE "mediaType"='video'`, string(route)); err != nil {
				t.Fatal(err)
			}
			response := httptest.NewRecorder()
			Video(cfg).ServeHTTP(response, request)
			var body map[string]any
			if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &body) != nil || body["status"] != item.status {
				t.Fatalf("terminal poll: %d %s", response.Code, response.Body.String())
			}
			status, result, reason, _, found, err := taskStatus(context.Background(), db, taskScope{workspace: "local", media: "video"}, "wan-terminal")
			if err != nil || !found || status != item.status || result != item.result || reason != item.reason {
				t.Fatalf("terminal evidence lost: status=%s result=%s reason=%s found=%v err=%v", status, result, reason, found, err)
			}
		})
	}
}

func TestReadVideoPollRequiresResultURL(t *testing.T) {
	missing := readVideoPoll(map[string]any{"status": "SUCCESS"})
	if missing.status == "SUCCESS" || missing.result != "" {
		t.Fatalf("success without url: %+v", missing)
	}
	content := readVideoPoll(map[string]any{"status": "SUCCESS", "content": map[string]any{"video_url": "https://cdn.example/a.mp4"}})
	if content.status != "SUCCESS" || content.result != "https://cdn.example/a.mp4" {
		t.Fatalf("content url: %+v", content)
	}
	kling := readVideoPoll(map[string]any{"data": map[string]any{"task_status": "succeed", "task_result": map[string]any{"videos": []any{map[string]any{"url": "https://cdn.example/b.mp4"}}}}})
	if kling.status != "SUCCESS" || kling.result != "https://cdn.example/b.mp4" {
		t.Fatalf("kling url: %+v", kling)
	}
	grok := readVideoPoll(map[string]any{"status": "done", "video": map[string]any{"url": "https://cdn.example/grok.mp4"}})
	if grok.status != "SUCCESS" || grok.result != "https://cdn.example/grok.mp4" {
		t.Fatalf("grok url: %+v", grok)
	}
	failed := readVideoPoll(map[string]any{"status": "failed", "error": map[string]any{"message": "上游拒绝"}})
	if failed.status != "FAILURE" || failed.reason != "上游拒绝" {
		t.Fatalf("grok error: %+v", failed)
	}
	nestedJSON := readVideoPoll(map[string]any{"status": "FAILURE", "fail_reason": `{"code":"1501","message":"Input material may contain sensitive content: videoUrls[0]. Please replace the material and try again | 用户输入的素材可能包含敏感内容：videoUrls[0]，请更换素材后重试"}`})
	if nestedJSON.status != "FAILURE" || !strings.Contains(nestedJSON.reason, "参考视频未通过安全检测") || strings.Contains(nestedJSON.reason, `"code"`) {
		t.Fatalf("nested json fail_reason: %+v", nestedJSON)
	}
}

func TestReadVideoPollDoesNotFinishQueuedResults(t *testing.T) {
	for _, status := range []string{"PENDING", "SUBMITTED", "NOT_START", "QUEUED", "RUNNING"} {
		t.Run(status, func(t *testing.T) {
			parsed := readVideoPoll(map[string]any{"status": status, "url": "https://cdn.example/preview.mp4"})
			if parsed.status != "IN_PROGRESS" || parsed.result != "" {
				t.Fatalf("unfinished task became downloadable: %+v", parsed)
			}
		})
	}
	parsed := readVideoPoll(map[string]any{"url": "https://cdn.example/completed.mp4"})
	if parsed.status != "SUCCESS" || parsed.result == "" {
		t.Fatalf("result-only completion lost: %+v", parsed)
	}
}

func TestVideoRecheckRecoversOriginalFailedReceipt(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != http.MethodGet || r.URL.Path != "/wan/api/v1/tasks/original-video" {
			t.Errorf("wrong recheck route: %s %s", r.Method, r.URL)
		}
		_, _ = w.Write([]byte(`{"output":{"task_status":"SUCCEEDED","video_url":"https://cdn.example/original.mp4"}}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = insertImageTask(context.Background(), db, "local", imageTaskDraft{
		TaskID: "original-video", Model: "wan3.0-video", MediaType: "video", Status: "FAILURE", FailReason: "渲染超时",
	})
	if err != nil {
		t.Fatal(err)
	}
	query := func(recheck string) map[string]any {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=original-video&model=wan3.0-video"+recheck, nil)
		r.Header.Set("x-custom-base-url", server.URL)
		r.Header.Set("x-custom-api-key", "test-key")
		base, key := pollCredentials(cfg, r)
		route, _ := json.Marshal(videoTaskRoute{Digest: videoRouteDigest(base, key, r.URL.Query().Get("model"), r)})
		if _, err := db.Exec(`UPDATE "ImageTask" SET "routeFingerprint"=? WHERE "mediaType"='video'`, string(route)); err != nil {
			t.Fatal(err)
		}
		w := httptest.NewRecorder()
		Video(cfg).ServeHTTP(w, r)
		var body map[string]any
		if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &body) != nil {
			t.Fatalf("query: %d %s", w.Code, w.Body.String())
		}
		return body
	}
	if body := query(""); body["status"] != "FAILURE" || calls.Load() != 0 {
		t.Fatalf("ordinary query must keep saved failure: %v", body)
	}
	if body := query("&recheck_failed=1"); body["status"] != "SUCCESS" || calls.Load() != 1 {
		t.Fatalf("explicit recheck did not recover: %v calls=%d", body, calls.Load())
	}
	if body := query("&recheck_failed=1"); body["status"] != "SUCCESS" || calls.Load() != 1 {
		t.Fatalf("saved completion must be reused: %v calls=%d", body, calls.Load())
	}
}
