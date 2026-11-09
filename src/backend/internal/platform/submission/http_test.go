package submission

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func receiptDB(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "receipts.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	raw, err := os.ReadFile(filepath.Join("..", "database", "migrate", "sources", "generation_submissions.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(string(raw)); err != nil {
		t.Fatal(err)
	}
	return path
}

func receiptRequest(handler http.Handler, method, key, workspace, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/phase?operationKey="+key, strings.NewReader(body))
	r = r.WithContext(httpx.WithWorkspace(r.Context(), workspace))
	r.Header.Set("x-idempotency-key", key)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestS09ConcurrentAndSequentialDuplicateUseOneDurableReceipt(t *testing.T) {
	path := receiptDB(t)
	var calls atomic.Int32
	started, release := make(chan struct{}), make(chan struct{})
	handler := Guard(path, "poster-title", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		<-release
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"success": true, "data": "original", "usage": map[string]any{"total_tokens": 7}})
	}))
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- receiptRequest(handler, "POST", "same", "owner", `{"prompt":"one"}`) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("first call not dispatched")
	}
	var group sync.WaitGroup
	for i := 0; i < 12; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			w := receiptRequest(handler, "POST", "same", "owner", `{"prompt":"one"}`)
			if w.Code != 409 || !strings.Contains(w.Body.String(), `"submissionUnknown":true`) {
				t.Errorf("pending %d %s", w.Code, w.Body.String())
			}
		}()
	}
	group.Wait()
	close(release)
	if w := <-done; w.Code != 200 {
		t.Fatalf("first %d %s", w.Code, w.Body.String())
	}
	for _, method := range []string{"GET", "POST"} {
		w := receiptRequest(handler, method, "same", "owner", `{"prompt":"one"}`)
		if w.Code != 200 || !strings.Contains(w.Body.String(), `"total_tokens":7`) || !strings.Contains(w.Body.String(), `"replayed":true`) {
			t.Fatalf("replay %d %s", w.Code, w.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatal("duplicate charged", calls.Load())
	}
	if w := receiptRequest(handler, "POST", "same", "owner", `{"prompt":"changed"}`); w.Code != 409 {
		t.Fatalf("input conflict %d", w.Code)
	}
	if w := receiptRequest(handler, "GET", "same", "other", ``); w.Code != 404 {
		t.Fatalf("workspace leak %d", w.Code)
	}
}

func TestS09ReceiptSurvivesClientDisconnectAndFreshHandler(t *testing.T) {
	path := receiptDB(t)
	started, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	fn := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		close(started)
		<-release
		if r.Context().Err() != nil {
			t.Error("client cancellation reached operation")
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "data": "finished"})
	})
	r := httptest.NewRequest("POST", "/phase", strings.NewReader(`{"prompt":"one"}`))
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	r = r.WithContext(ctx)
	r.Header.Set("x-idempotency-key", "disconnect")
	done := make(chan struct{})
	go func() { defer close(done); Guard(path, "phase", fn).ServeHTTP(httptest.NewRecorder(), r) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("not started")
	}
	cancel()
	close(release)
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("settlement blocked")
	}
	replay := receiptRequest(Guard(path, "phase", fn), "GET", "disconnect", "local", ``)
	if replay.Code != 200 || !strings.Contains(replay.Body.String(), "finished") || calls.Load() != 1 {
		t.Fatalf("lost receipt %d %s", replay.Code, replay.Body.String())
	}
}

func TestS09InterruptedProcessAndSettlementFailureNeverRedispatch(t *testing.T) {
	path := receiptDB(t)
	if _, owned, err := claim(context.Background(), path, "local", "phase", "process-lost", Hash(map[string]any{"prompt": "one", "credentialDigest": Hash(""), "baseHeader": ""})); err != nil || !owned {
		t.Fatal(owned, err)
	}
	var calls atomic.Int32
	fn := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "data": "paid"})
	})
	handler := Guard(path, "phase", fn)
	pending := receiptRequest(handler, "POST", "process-lost", "local", `{"prompt":"one"}`)
	if pending.Code != 409 || calls.Load() != 0 || strings.Contains(pending.Body.String(), "IN_PROGRESS") {
		t.Fatalf("restart %d %s", pending.Code, pending.Body.String())
	}
	db, err := database.OpenRequired(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TRIGGER reject_settlement BEFORE UPDATE ON "GenerationSubmission" BEGIN SELECT RAISE(FAIL,'read-only settlement'); END`)
	_ = db.Close()
	if err != nil {
		t.Fatal(err)
	}
	failed := receiptRequest(handler, "POST", "settlement-lost", "local", `{"prompt":"one"}`)
	if failed.Code != 503 || !strings.Contains(failed.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("settlement %d %s", failed.Code, failed.Body.String())
	}
	again := receiptRequest(Guard(path, "phase", fn), "POST", "settlement-lost", "local", `{"prompt":"one"}`)
	if again.Code != 409 || calls.Load() != 1 {
		t.Fatalf("resubmitted %d calls=%d", again.Code, calls.Load())
	}
}

func TestS09NoStorageMeansNoBillableCallAndKindsRemainSeparate(t *testing.T) {
	var calls atomic.Int32
	fn := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		httpx.WriteJSON(w, 200, map[string]any{"success": true})
	})
	if w := receiptRequest(Guard(filepath.Join(t.TempDir(), "missing.db"), "phase", fn), "POST", "one", "local", `{}`); w.Code != 503 || calls.Load() != 0 {
		t.Fatalf("called without receipt %d", w.Code)
	}
	path := receiptDB(t)
	for _, kind := range []string{"poster-title", "poster-design"} {
		if w := receiptRequest(Guard(path, kind, fn), "POST", "same-key", "local", `{}`); w.Code != 200 {
			t.Fatalf("kind %s %d %s", kind, w.Code, w.Body.String())
		}
	}
	if calls.Load() != 2 {
		t.Fatal("phase identities merged", calls.Load())
	}
}
