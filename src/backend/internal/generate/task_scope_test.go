package generate

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/httpx"
)

func TestTaskPollEnforcesWorkspaceAndMediaBeforeUpstream(t *testing.T) {
	var upstream atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstream.Add(1)
		_, _ = w.Write([]byte(`{"status":"SUCCESS","url":"https://example.test/private.png"}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	cfg.NodeEnv = "production"
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
		INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","mediaType","resultUrl","usage","idempotencyKey") VALUES
		('image','owner','saved-image','SUCCESS','image','https://example.test/private.png','{"totalTokens":12}','image-key'),
		('pending','owner','pending-image','IN_PROGRESS','image',NULL,NULL,'pending-key'),
		('direct','owner','direct_saved','SUCCESS',NULL,'https://example.test/private.png',NULL,'direct-key'),
		('video','owner','saved-video','SUCCESS','video','https://example.test/private.mp4',NULL,'video-key'),
		('audio','owner','saved-audio','SUCCESS','audio','https://example.test/private.mp3',NULL,'audio-key')`)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		endpoint, query, workspace string
		allowed                    bool
	}{
		{"image", "taskId=saved-image", "owner", true},
		{"image", "taskId=direct_saved", "owner", true},
		{"video", "taskId=saved-video", "owner", true},
		{"audio", "taskId=saved-audio", "owner", true},
		{"audio", "taskKey=audio-key", "owner", true},
		{"image", "taskId=saved-image", "other", false},
		{"image", "taskId=pending-image", "other", false},
		{"image", "taskId=direct_saved", "other", false},
		{"video", "taskId=saved-image", "owner", false},
		{"image", "taskId=saved-video", "owner", false},
		{"audio", "taskId=saved-image", "owner", false},
		{"audio", "taskId=saved-audio", "other", false},
		{"audio", "taskKey=audio-key", "other", false},
		{"image", "taskId=not-recorded", "owner", false},
		{"video", "taskId=not-recorded", "owner", false},
	} {
		t.Run(tc.endpoint+"/"+tc.query+"/"+tc.workspace, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/generate/"+tc.endpoint+"?"+tc.query, nil)
			r = r.WithContext(httpx.WithWorkspace(r.Context(), tc.workspace))
			r.Header.Set("x-custom-base-url", server.URL)
			r.Header.Set("x-custom-api-key", "test-only")
			w := httptest.NewRecorder()
			switch tc.endpoint {
			case "image":
				Image(cfg).ServeHTTP(w, r)
			case "video":
				Video(cfg).ServeHTTP(w, r)
			case "audio":
				Audio(cfg).ServeHTTP(w, r)
			}
			containsPrivate := strings.Contains(w.Body.String(), "example.test/private")
			if containsPrivate != tc.allowed {
				t.Fatalf("allowed=%v status=%d body=%s", tc.allowed, w.Code, w.Body.String())
			}
			if !tc.allowed && strings.Contains(w.Body.String(), `"totalTokens":12`) {
				t.Fatalf("usage leaked: %s", w.Body.String())
			}
		})
	}
	if upstream.Load() != 0 {
		t.Fatalf("unowned/unknown task reached upstream %d times", upstream.Load())
	}
}

func TestTaskTerminalPollDoesNotUpdateCollidingWorkspaceOrMedia(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"status":"SUCCESS","url":"https://example.test/result.png","usage":{"total_tokens":12}}`))
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
		INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","mediaType") VALUES
		('owned','owner','same-id','IN_PROGRESS','image'),
		('other','other','same-id','IN_PROGRESS','image'),
		('video','owner','same-id','IN_PROGRESS','video')`)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=same-id", nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
	r.Header.Set("x-custom-base-url", server.URL)
	w := httptest.NewRecorder()
	Image(cfg).ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"status":"SUCCESS"`) {
		t.Fatalf("owned poll failed: %d %s", w.Code, w.Body.String())
	}
	var changed int
	err = db.QueryRow(`SELECT count(*) FROM "ImageTask" WHERE "id" != 'owned' AND ("status" != 'IN_PROGRESS' OR "usage" IS NOT NULL OR "resultUrl" IS NOT NULL)`).Scan(&changed)
	if err != nil || changed != 0 {
		t.Fatalf("unrelated receipts changed: %d %v", changed, err)
	}
}
