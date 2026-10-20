package generate

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestVideoUnknownSubmissionReconcilesTerminalWithoutResubmit(t *testing.T) {
	cases := []struct {
		name, upstream, status, result string
		withUsage                      bool
	}{
		{"success", `{"status":"SUCCESS","video_url":"https://cdn.example/finished.mp4","usage":{"total_tokens":12}}`, "SUCCESS", "https://cdn.example/finished.mp4", true},
		{"failure", `{"status":"FAILED","fail_reason":"render rejected"}`, "FAILURE", "", false},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var posts, gets atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodPost {
					posts.Add(1)
					w.WriteHeader(http.StatusInternalServerError)
					_, _ = w.Write([]byte(`{"task_id":"known-uncertain"}`))
					return
				}
				gets.Add(1)
				_, _ = w.Write([]byte(item.upstream))
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if item.withUsage {
				if _, err = db.Exec(`ALTER TABLE "ImageTask" ADD COLUMN "usage" TEXT`); err != nil {
					t.Fatal(err)
				}
			}
			handler := Video(cfg)
			initial := videoSubmissionTestPost(handler, server.URL, "reconcile", "海边", "local")
			if initial.Code != http.StatusServiceUnavailable {
				t.Fatalf("initial: %d %s", initial.Code, initial.Body.String())
			}
			// Deliberately collide upstream IDs: reconciliation must be scoped to
			// this workspace and video media, not every uncertain record with the ID.
			for _, scope := range []struct{ workspace, media, key string }{{"other", "video", "reconcile"}, {"local", "image", "image-key"}} {
				_, err = insertImageTask(context.Background(), db, scope.workspace, imageTaskDraft{
					Prompt: "untouched", TaskID: "known-uncertain", Status: "SUBMISSION_UNKNOWN", MediaType: scope.media, IdempotencyKey: scope.key,
				})
				if err != nil {
					t.Fatal(err)
				}
			}
			request := httptest.NewRequest(http.MethodGet, "/api/generate/video?taskId=known-uncertain&model=veo3.1", nil)
			request.Header.Set("x-custom-base-url", server.URL)
			request.Header.Set("x-custom-api-key", "secret")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"status":"`+item.status+`"`) {
				t.Fatalf("terminal poll: %d %s", response.Code, response.Body.String())
			}
			row, err := lookupVideoSubmission(cfg, request, "reconcile")
			if err != nil || row.status != item.status || row.result != item.result {
				t.Fatalf("persisted terminal: %+v %v", row, err)
			}
			var changed int
			err = db.QueryRow(`SELECT count(*) FROM "ImageTask" WHERE ("workspaceId" = 'other' OR "mediaType" = 'image') AND "status" != 'SUBMISSION_UNKNOWN'`).Scan(&changed)
			if err != nil || changed != 0 {
				t.Fatalf("unrelated receipts changed: %d %v", changed, err)
			}
			if item.withUsage && readTaskUsage(context.Background(), db, "known-uncertain") == "" {
				t.Fatal("terminal usage was not saved")
			}
			keyed := videoSubmissionTestGet(handler, "reconcile", "local")
			if !strings.Contains(keyed.Body.String(), `"submissionOutcome":"accepted"`) || !strings.Contains(keyed.Body.String(), `"status":"`+item.status+`"`) || strings.Contains(keyed.Body.String(), `"submissionRejected":true`) {
				t.Fatalf("reconciled key: %s", keyed.Body.String())
			}
			repeated := videoSubmissionTestPost(handler, server.URL, "reconcile", "海边", "local")
			if repeated.Code != http.StatusOK || posts.Load() != 1 || gets.Load() != 1 {
				t.Fatalf("reconciliation resubmitted: %d %s posts=%d gets=%d", repeated.Code, repeated.Body.String(), posts.Load(), gets.Load())
			}
			// A later conflicting poll cannot overwrite the terminal receipt.
			settleUnknownVideoTerminal(cfg, request, "known-uncertain", pollParsed{status: "FAILURE", reason: "late response"}, "")
			after, _ := lookupVideoSubmission(cfg, request, "reconcile")
			if after.status != row.status || after.reason != row.reason || after.result != row.result {
				t.Fatalf("terminal receipt overwritten: before=%+v after=%+v", row, after)
			}
		})
	}
}

func TestVideoUnknownSubmissionStaysUnknownWithoutTerminalEvidence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, taskID := range []string{"known", "pending_placeholder"} {
		_, err := insertImageTask(context.Background(), db, "local", imageTaskDraft{
			Prompt: "uncertain", TaskID: taskID, Status: "SUBMISSION_UNKNOWN", MediaType: "video", IdempotencyKey: taskID,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(http.MethodGet, "/api/generate/video", nil)
	settleUnknownVideoTerminal(cfg, request, "known", readVideoPoll(map[string]any{"status": "SUCCESS"}), "")
	settleUnknownVideoTerminal(cfg, request, "known", pollParsed{status: "SUCCESS"}, "")
	settleUnknownVideoTerminal(cfg, request, "known", pollParsed{status: "IN_PROGRESS"}, "")
	settleUnknownVideoTerminal(cfg, request, "pending_placeholder", pollParsed{status: "FAILURE"}, "")
	var changed int
	if err = db.QueryRow(`SELECT count(*) FROM "ImageTask" WHERE "status" != 'SUBMISSION_UNKNOWN'`).Scan(&changed); err != nil || changed != 0 {
		t.Fatalf("uncertain state changed without evidence: %d %v", changed, err)
	}
}
