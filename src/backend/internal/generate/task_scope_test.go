package generate

import (
	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/gateway"
	"beike.local/cloud/src/backend/internal/httpx"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
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

func submissionSchemaForTest(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "platform", "database", "migrate", "sources", "generation_submissions.sql"))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestLateSuccessRecoversOnlyItsFailedReceipt(t *testing.T) {
	for _, usage := range []string{"", `{"totalTokens":12}`} {
		t.Run("usage="+usage, func(t *testing.T) {
			server := httptest.NewServer(http.NotFoundHandler())
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			_, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT;
				INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","mediaType","failReason") VALUES
				('owned','owner','same-task','FAILURE','video','old timeout'),
				('other','other','same-task','FAILURE','video','old timeout'),
				('image','owner','same-task','FAILURE','image','old timeout')`)
			if err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			scope := taskScope{workspace: "owner", media: "video"}
			updateTaskTerminal(ctx, db, scope, "same-task", "SUCCESS", "", "", usage)
			status, _, _, _, _, _ := taskStatus(ctx, db, scope, "same-task")
			if status != "FAILURE" {
				t.Fatal("a success without a result recovered the failed receipt")
			}
			updateTaskTerminal(ctx, db, scope, "same-task", "SUCCESS", "/storage/recovered.mp4", "", usage)
			updateTaskTerminal(ctx, db, scope, "same-task", "FAILURE", "", "late failed response", "")
			status, result, reason, storedUsage, _, err := taskStatus(ctx, db, scope, "same-task")
			if err != nil || status != "SUCCESS" || result != "/storage/recovered.mp4" || reason != "" || !reflect.DeepEqual(gateway.DecodeUsage(storedUsage), gateway.DecodeUsage(usage)) {
				t.Fatalf("completion was lost: %s %s %s %s %v", status, result, reason, storedUsage, err)
			}
			var changed int
			err = db.QueryRow(`SELECT COUNT(*) FROM "ImageTask" WHERE "id" != 'owned' AND ("status" != 'FAILURE' OR "resultUrl" IS NOT NULL OR "usage" IS NOT NULL)`).Scan(&changed)
			if err != nil || changed != 0 {
				t.Fatalf("unrelated receipts changed: %d %v", changed, err)
			}
		})
	}
}

func TestNormalizeUsageReadsTokenAliases(t *testing.T) {
	top := gateway.NormalizeUsage(map[string]any{"usage": map[string]any{"prompt_tokens": 3.0, "completion_tokens": 4.0, "total_tokens": 7.0}})
	if top["promptTokens"] != 3.0 || top["completionTokens"] != 4.0 || top["totalTokens"] != 7.0 {
		t.Fatalf("chat %#v", top)
	}
	nested := gateway.NormalizeUsage(map[string]any{"data": map[string]any{"usage": map[string]any{"input_tokens": "11", "output_tokens": 22.0}}})
	if nested["promptTokens"] != 11.0 || nested["completionTokens"] != 22.0 || nested["totalTokens"] != 33.0 {
		t.Fatalf("image %#v", nested)
	}
	if gateway.NormalizeUsage(map[string]any{"usage": map[string]any{"prompt_tokens": 0.0}}) != nil {
		t.Fatal("empty usage should be omitted")
	}
	if gateway.NormalizeUsage(map[string]any{"message": "ok"}) != nil {
		t.Fatal("missing usage should be omitted")
	}
}

func TestImagePollReturnsUpstreamUsage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"task_id":"img-usage-1"}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"status":"SUCCESS","url":"https://cdn.example.com/out.jpg","usage":{"input_tokens":11,"output_tokens":22,"total_tokens":33}}}`))
	}))
	defer server.Close()
	previous := gateway.ModelHTTP
	gateway.ModelHTTP = func() *http.Client { return server.Client() }
	t.Cleanup(func() { gateway.ModelHTTP = previous })
	handler := Image(config.Config{DatabaseURL: "file:" + imageTaskDatabase(t), NodeEnv: "development"})
	created := httptest.NewRecorder()
	handler.ServeHTTP(created, httptest.NewRequest(http.MethodPost, "/api/generate/image", strings.NewReader(`{"prompt":"一只猫","model":"gpt-image-2","customApiKey":"secret","customBaseUrl":"`+server.URL+`"}`)))
	if created.Code != http.StatusOK {
		t.Fatalf("submit %d %s", created.Code, created.Body.String())
	}
	polled := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/generate/image?taskId=img-usage-1", nil)
	request.Header.Set("x-custom-base-url", server.URL)
	request.Header.Set("x-custom-api-key", "secret")
	handler.ServeHTTP(polled, request)
	body := polled.Body.String()
	if polled.Code != http.StatusOK || !strings.Contains(body, `"promptTokens":11`) || !strings.Contains(body, `"completionTokens":22`) || !strings.Contains(body, `"totalTokens":33`) {
		t.Fatalf("poll %d %s", polled.Code, body)
	}
}
