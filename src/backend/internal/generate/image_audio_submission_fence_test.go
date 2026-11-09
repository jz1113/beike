package generate

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
)

type delayedSubmissionBody struct {
	started, release chan struct{}
	reader           io.Reader
	reading          bool
}

func (b *delayedSubmissionBody) Read(p []byte) (int, error) {
	if !b.reading {
		b.reading = true
		close(b.started)
		<-b.release
	}
	return b.reader.Read(p)
}
func (b *delayedSubmissionBody) Close() error { return nil }

func fenceHandler(cfg config.Config, media string) http.Handler {
	if media == "audio" {
		return Audio(cfg)
	}
	return Image(cfg)
}
func fencePost(h http.Handler, base, media, key, workspace string) *httptest.ResponseRecorder {
	if media == "audio" {
		return audioSubmissionRequest(h, base, key, "same", workspace)
	}
	return imageSubmissionPost(h, base, key, "same", workspace)
}
func fenceGet(h http.Handler, media, key, workspace string, closeMissing bool) *httptest.ResponseRecorder {
	path := "/api/generate/" + media + "?taskKey=" + key
	if closeMissing {
		path += "&closeMissing=true"
	}
	r := httptest.NewRequest("GET", path, nil)
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func assertClosedSubmission(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	var body map[string]any
	if json.Unmarshal(w.Body.Bytes(), &body) != nil || body["status"] != "FAILURE" || body["submissionRejected"] != true {
		t.Fatalf("not closed: %d %s", w.Code, w.Body.String())
	}
}

// P1: recovery must fence the original key before a new attempt can reach upstream.
func TestMissingImageAudioIntentFencesDelayedBodyBeforeRetry(t *testing.T) {
	for _, media := range []string{"image", "audio"} {
		t.Run(media, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				io.WriteString(w, `{"task_id":"provider-image","audio_url":"https://media.example/audio.mp3"}`)
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			h := fenceHandler(cfg, media)
			model := "gpt-image-2"
			if media == "audio" {
				model = "speech-2.8-hd"
			}
			raw, _ := json.Marshal(map[string]any{"model": model, "prompt": "same", "clientTaskId": "old-key", "customBaseUrl": server.URL, "customApiKey": "test-only"})
			body := &delayedSubmissionBody{started: make(chan struct{}), release: make(chan struct{}), reader: strings.NewReader(string(raw))}
			r := httptest.NewRequest("POST", "/api/generate/"+media, nil)
			r.Body = body
			r = r.WithContext(httpx.WithWorkspace(r.Context(), "owner"))
			r.Header.Set("x-idempotency-key", "old-key")
			done := make(chan *httptest.ResponseRecorder, 1)
			go func() { w := httptest.NewRecorder(); h.ServeHTTP(w, r); done <- w }()
			<-body.started
			// Plain probes remain read-only and do not prove a delayed POST is impossible.
			for i := 0; i < 6; i++ {
				w := fenceGet(h, media, "old-key", "owner", false)
				if !strings.Contains(w.Body.String(), "QUERY_FAILED") {
					t.Fatal(w.Body.String())
				}
			}
			closed := fenceGet(h, media, "old-key", "owner", true)
			// Release even on assertion failure, so no test server/request leaks.
			close(body.release)
			old := <-done
			assertClosedSubmission(t, closed)
			assertClosedSubmission(t, old)
			if calls.Load() != 0 {
				t.Fatalf("closed old request reached upstream: %d", calls.Load())
			}
			// A reconstructed handler must still reject the key from durable storage.
			assertClosedSubmission(t, fencePost(fenceHandler(cfg, media), server.URL, media, "old-key", "owner"))
			fresh := fencePost(h, server.URL, media, "new-key", "owner")
			if fresh.Code != 200 || calls.Load() != 1 {
				t.Fatalf("new attempt: %d %s calls=%d", fresh.Code, fresh.Body.String(), calls.Load())
			}
		})
	}
}

func TestCloseMissingImageAudioPreservesClaimedUnknownReceipt(t *testing.T) {
	for _, media := range []string{"image", "audio"} {
		t.Run(media, func(t *testing.T) {
			started, release := make(chan struct{}), make(chan struct{})
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				close(started)
				<-release
				io.WriteString(w, `{}`)
			}))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			h := fenceHandler(cfg, media)
			done := make(chan *httptest.ResponseRecorder, 1)
			go func() { done <- fencePost(h, server.URL, media, "paid-key", "owner") }()
			<-started
			pending := fenceGet(h, media, "paid-key", "owner", true)
			close(release)
			<-done
			if strings.Contains(pending.Body.String(), `"status":"FAILURE"`) {
				t.Fatalf("closed active operation: %s", pending.Body.String())
			}
			unknown := fenceGet(fenceHandler(cfg, media), media, "paid-key", "owner", true)
			if !strings.Contains(unknown.Body.String(), `"submissionUnknown":true`) {
				t.Fatalf("lost unknown receipt: %s", unknown.Body.String())
			}
			fencePost(h, server.URL, media, "paid-key", "owner")
			if calls.Load() != 1 {
				t.Fatalf("resubmitted paid operation: %d", calls.Load())
			}
		})
	}
}

func TestCloseMissingImageAudioIsWorkspaceAndMediaScoped(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		io.WriteString(w, `{"task_id":"image","audio_url":"https://media.example/audio.mp3"}`)
	}))
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	assertClosedSubmission(t, fenceGet(Image(cfg), "image", "shared-key", "owner", true))
	if w := fencePost(Audio(cfg), server.URL, "audio", "shared-key", "owner"); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := fencePost(Image(cfg), server.URL, "image", "shared-key", "other"); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	assertClosedSubmission(t, fenceGet(Audio(cfg), "audio", "closed-audio", "owner", true))
	if w := fencePost(Audio(cfg), server.URL, "audio", "closed-audio", "other"); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if calls.Load() != 3 {
		t.Fatalf("scope isolation: calls=%d", calls.Load())
	}
}

func TestCloseMissingAudioPreservesLegacyTask(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	cfg := videoSubmissionTestConfig(t, server)
	db, err := openTaskDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO "ImageTask" ("id","workspaceId","taskId","status","resultUrl","idempotencyKey","mediaType") VALUES ('legacy','owner','original','SUCCESS','https://media.example/original.mp3','legacy-key','audio')`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	w := fenceGet(Audio(cfg), "audio", "legacy-key", "owner", true)
	if !strings.Contains(w.Body.String(), "https://media.example/original.mp3") || strings.Contains(w.Body.String(), "submissionClosed") {
		t.Fatal(w.Body.String())
	}
}

func TestCloseMissingImageAudioStorageFailureStaysUnknown(t *testing.T) {
	for _, media := range []string{"image", "audio"} {
		t.Run(media, func(t *testing.T) {
			server := httptest.NewServer(http.NotFoundHandler())
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			table := "ImageTask"
			if media == "audio" {
				table = "GenerationSubmission"
			}
			_, err = db.Exec(`DROP TABLE "` + table + `"`)
			db.Close()
			if err != nil {
				t.Fatal(err)
			}
			w := fenceGet(fenceHandler(cfg, media), media, "missing-key", "owner", true)
			if w.Code != 503 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
				t.Fatalf("storage error unlocked retry: %d %s", w.Code, w.Body.String())
			}
		})
	}
}

// Concurrent recovery tabs must observe one durable closure, never overwrite a claim.
func TestConcurrentImageAudioClosuresBlockOriginalKey(t *testing.T) {
	for _, media := range []string{"image", "audio"} {
		t.Run(media, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); io.WriteString(w, `{}`) }))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			results := make(chan *httptest.ResponseRecorder, 12)
			for i := 0; i < 12; i++ {
				go func() { results <- fenceGet(fenceHandler(cfg, media), media, "same-key", "owner", true) }()
			}
			for i := 0; i < 12; i++ {
				assertClosedSubmission(t, <-results)
			}
			assertClosedSubmission(t, fencePost(fenceHandler(cfg, media), server.URL, media, "same-key", "owner"))
			if calls.Load() != 0 {
				t.Fatalf("closed key submitted %d times", calls.Load())
			}
		})
	}
}

func TestImageAudioClosureWriteFailureDoesNotConfirmRejection(t *testing.T) {
	for _, media := range []string{"image", "audio"} {
		t.Run(media, func(t *testing.T) {
			server := httptest.NewServer(http.NotFoundHandler())
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			db, err := openTaskDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			table := "ImageTask"
			if media == "audio" {
				table = "GenerationSubmission"
			}
			_, err = db.Exec(`CREATE TRIGGER reject_closure BEFORE INSERT ON "` + table + `" BEGIN SELECT RAISE(ABORT,'disk write failed'); END`)
			db.Close()
			if err != nil {
				t.Fatal(err)
			}
			w := fenceGet(fenceHandler(cfg, media), media, "write-failed", "owner", true)
			if w.Code != 503 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) || strings.Contains(w.Body.String(), `"submissionRejected":true`) {
				t.Fatalf("unconfirmed closure unlocked retry: %d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestImageAudioClaimRacesClosureWithoutOverwritingWinner(t *testing.T) {
	for _, media := range []string{"image", "audio"} {
		t.Run(media, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); io.WriteString(w, `{}`) }))
			defer server.Close()
			cfg := videoSubmissionTestConfig(t, server)
			for i := 0; i < 8; i++ {
				key := "race-key-" + strconv.Itoa(i)
				start := make(chan struct{})
				posted := make(chan *httptest.ResponseRecorder, 1)
				queried := make(chan *httptest.ResponseRecorder, 1)
				before := calls.Load()
				go func() { <-start; posted <- fencePost(fenceHandler(cfg, media), server.URL, media, key, "owner") }()
				go func() { <-start; queried <- fenceGet(fenceHandler(cfg, media), media, key, "owner", true) }()
				close(start)
				post, query := <-posted, <-queried
				if query.Code != 200 && !(query.Code == 502 && strings.Contains(query.Body.String(), `"submissionUnknown":true`)) {
					t.Fatalf("race query: %d %s", query.Code, query.Body.String())
				}
				closed := strings.Contains(query.Body.String(), `"status":"FAILURE"`)
				if closed {
					assertClosedSubmission(t, post)
					if calls.Load() != before {
						t.Fatal("closed operation reached upstream")
					}
				} else if calls.Load() != before+1 {
					t.Fatal("claimed operation did not execute exactly once")
				}
				observed := calls.Load()
				fencePost(fenceHandler(cfg, media), server.URL, media, key, "owner")
				if calls.Load() != observed {
					t.Fatal("race winner was overwritten and resubmitted")
				}
			}
		})
	}
}
