package library

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
)

func TestDeconstructJobPostValidation(t *testing.T) {
	handler := deconstructJobsPostHandler(config.Config{Upstream: "http://127.0.0.1:1"})
	empty := httptest.NewRecorder()
	handler.ServeHTTP(empty, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct/jobs", nil))
	if empty.Code != http.StatusRequestEntityTooLarge || !strings.Contains(empty.Body.String(), "job_body_too_large") {
		t.Fatalf("empty %d %s", empty.Code, empty.Body.String())
	}
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct/jobs", strings.NewReader(`{}`)))
	if missing.Code != http.StatusBadRequest || !strings.Contains(missing.Body.String(), "Required") || !strings.Contains(missing.Body.String(), "invalid_job_submission") {
		t.Fatalf("missing %d %s", missing.Code, missing.Body.String())
	}
	stop := httptest.NewRecorder()
	handler.ServeHTTP(stop, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct/jobs", strings.NewReader(`{"action":"no","jobId":"a"}`)))
	if stop.Code != http.StatusBadRequest || !strings.Contains(stop.Body.String(), "停止任务参数无效") {
		t.Fatalf("stop %d %s", stop.Code, stop.Body.String())
	}
	duplicate := httptest.NewRecorder()
	handler.ServeHTTP(duplicate, httptest.NewRequest(http.MethodPost, "/api/catalog/assets/deconstruct/jobs", strings.NewReader(`{"jobId":"job","items":[{"id":"a","name":"n","images":["x"]},{"id":"a","name":"n","images":["x"]}]}`)))
	if duplicate.Code != http.StatusBadRequest || !strings.Contains(duplicate.Body.String(), "图集任务 ID 不能重复") {
		t.Fatalf("duplicate %d %s", duplicate.Code, duplicate.Body.String())
	}
}
