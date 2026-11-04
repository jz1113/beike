package generate

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

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
