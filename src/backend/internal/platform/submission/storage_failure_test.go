package submission

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func TestReceiptClaimStorageFailurePreservesUnknownOperation(t *testing.T) {
	path := receiptDB(t)
	started, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	defer unblock()
	var calls atomic.Int32
	handler := Guard(path, "audio", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(started)
			<-release
		}
		httpx.WriteJSON(w, 200, map[string]any{"success": true, "audioUrl": "original.mp3"})
	}))
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- receiptRequest(handler, "POST", "same", "owner", `{"prompt":"one"}`) }()
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("not dispatched")
	}
	db, err := database.OpenRequired(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TRIGGER unavailable BEFORE INSERT ON GenerationSubmission BEGIN SELECT RAISE(ABORT,'storage failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"same", "new"} {
		response := receiptRequest(handler, "POST", key, "owner", `{"prompt":"one"}`)
		if response.Code != 503 || !strings.Contains(response.Body.String(), `"submissionUnknown":true`) || strings.Contains(response.Body.String(), `"submissionRejected":true`) {
			t.Errorf("storage error releases operation: %d %s", response.Code, response.Body.String())
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("storage failure dispatched another request: %d", calls.Load())
	}
	pending := receiptRequest(handler, "GET", "same", "owner", "")
	if pending.Code != 409 || !strings.Contains(pending.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("lost original receipt: %s", pending.Body.String())
	}
	if _, err = db.Exec(`DROP TRIGGER unavailable`); err != nil {
		t.Fatal(err)
	}
	unblock()
	if response := <-done; response.Code != 200 {
		t.Fatalf("original failed: %d %s", response.Code, response.Body.String())
	}
	for _, method := range []string{"GET", "POST"} {
		response := receiptRequest(Guard(path, "audio", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) })), method, "same", "owner", `{"prompt":"one"}`)
		if response.Code != 200 || !strings.Contains(response.Body.String(), "original.mp3") || calls.Load() != 1 {
			t.Fatalf("did not recover original: %d %s calls=%d", response.Code, response.Body.String(), calls.Load())
		}
	}
}

func TestReceiptReadAndRejectedSettlementStorageFailuresRemainUnknown(t *testing.T) {
	missing := Guard(t.TempDir()+"/missing.db", "audio", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Fatal("must not execute") }))
	unreadable := receiptRequest(missing, "GET", "same", "owner", "")
	if unreadable.Code != 503 || !strings.Contains(unreadable.Body.String(), `"submissionUnknown":true`) {
		t.Fatalf("read error lost unknown state: %d %s", unreadable.Code, unreadable.Body.String())
	}
	path := receiptDB(t)
	db, err := database.OpenRequired(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`CREATE TRIGGER unavailable BEFORE UPDATE ON GenerationSubmission BEGIN SELECT RAISE(ABORT,'storage failure'); END`); err != nil {
		t.Fatal(err)
	}
	handler := Guard(path, "audio", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, 400, map[string]any{"success": false, "submissionRejected": true, "error": "validation failed"})
	}))
	response := receiptRequest(handler, "POST", "same", "owner", `{"prompt":"one"}`)
	if response.Code != 503 || !strings.Contains(response.Body.String(), `"submissionUnknown":true`) || strings.Contains(response.Body.String(), `"submissionRejected":true`) {
		t.Fatalf("contradictory settlement flags: %d %s", response.Code, response.Body.String())
	}
}
