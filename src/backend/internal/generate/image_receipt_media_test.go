package generate

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestImageReceiptLookupAndReuseFilterMedia(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("receipt lookup must not call upstream: %s %s", r.Method, r.URL)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	cases := []struct {
		name  string
		media any
	}{
		{"image", "image"},
		{"legacy null", nil},
		{"legacy empty", ""},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := db.Exec(`DELETE FROM "ImageTask"`)
			if err != nil {
				t.Fatal(err)
			}
			_, err = db.Exec(`INSERT INTO "ImageTask" ("id", "workspaceId", "idempotencyKey", "taskId", "status", "resultUrl", "mediaType", "createdAt") VALUES
				('image-row','local','shared','direct_image','SUCCESS','https://cdn.example/image.png',?,'2026-01-01'),
				('video-row','local','shared','video-task','SUCCESS','https://cdn.example/video.mp4','video','2026-02-01'),
				('other-workspace','elsewhere','shared','direct_other','SUCCESS','https://cdn.example/other.png','image','2026-03-01')`, item.media)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskKey=shared", nil)
			row, err := lookupImageTaskByKey(cfg, request, "shared")
			if err != nil || !row.found || row.taskID != "direct_image" {
				t.Fatalf("lookup: %+v %v", row, err)
			}
			id, taskID, result, ok := reuseImageTask(context.Background(), db, "local", "shared")
			if !ok || id != "image-row" || taskID != "direct_image" || result != "https://cdn.example/image.png" {
				t.Fatalf("reuse: %s %s %s %v", id, taskID, result, ok)
			}
			response := httptest.NewRecorder()
			Image(cfg).ServeHTTP(response, request)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "https://cdn.example/image.png") || strings.Contains(response.Body.String(), "video.mp4") {
				t.Fatalf("image taskKey: %d %s", response.Code, response.Body.String())
			}
			_, err = db.Exec(`DELETE FROM "ImageTask" WHERE "id" = 'image-row'`)
			if err != nil {
				t.Fatal(err)
			}
			row, err = lookupImageTaskByKey(cfg, request, "shared")
			if err != nil || row.found {
				t.Fatalf("video-only key must not resolve as image: %+v %v", row, err)
			}
			if _, _, _, ok := reuseImageTask(context.Background(), db, "local", "shared"); ok {
				t.Fatal("video-only key reused as image")
			}
		})
	}
}
