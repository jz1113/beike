package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
			status, result, reason, _, found, err := taskStatus(context.Background(), db, taskScope{"local", "video"}, "wan-original")
			if err != nil || !found || status != "IN_PROGRESS" || result != "" || reason != "" {
				t.Fatalf("original task changed: status=%s result=%s reason=%s found=%v err=%v", status, result, reason, found, err)
			}
			beforeRecovery := calls.Load()
			upstream.Store(`{"output":{"task_status":"SUCCEEDED","video_url":"https://cdn.example/wan.mp4"}}`)
			body = poll()
			if body["status"] != "SUCCESS" || body["resultUrl"] != "https://cdn.example/wan.mp4" || calls.Load() <= beforeRecovery {
				t.Fatalf("original task could not recover: %v calls=%d", body, calls.Load())
			}
			status, result, _, _, _, err = taskStatus(context.Background(), db, taskScope{"local", "video"}, "wan-original")
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
			response := httptest.NewRecorder()
			Video(cfg).ServeHTTP(response, request)
			var body map[string]any
			if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &body) != nil || body["status"] != item.status {
				t.Fatalf("terminal poll: %d %s", response.Code, response.Body.String())
			}
			status, result, reason, _, found, err := taskStatus(context.Background(), db, taskScope{"local", "video"}, "wan-terminal")
			if err != nil || !found || status != item.status || result != item.result || reason != item.reason {
				t.Fatalf("terminal evidence lost: status=%s result=%s reason=%s found=%v err=%v", status, result, reason, found, err)
			}
		})
	}
}
