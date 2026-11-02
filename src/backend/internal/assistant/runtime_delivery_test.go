package assistant

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
	"beike.local/cloud/src/backend/internal/httpx"
	"beike.local/cloud/src/backend/internal/platform/database"
)

func deliveryConfig(t *testing.T) config.Config {
	t.Helper()
	t.Setenv("AZHUO_USER_DATA_DIR", t.TempDir())
	t.Cleanup(FlushTelemetry)
	path := filepath.Join(t.TempDir(), "delivery.db")
	db, err := database.OpenWrite(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, statement := range []string{
		`CREATE TABLE AssistantThread (id TEXT PRIMARY KEY, workspaceId TEXT, messagesJson TEXT)`,
		`CREATE TABLE AssistantTurn (id TEXT PRIMARY KEY, workspaceId TEXT, threadId TEXT, model TEXT, status TEXT, startedAt TEXT, completedAt TEXT, usageInputTokens INTEGER, usageOutputTokens INTEGER, snapshotJson TEXT)`,
		`CREATE TABLE AssistantTurnItem (id TEXT PRIMARY KEY, workspaceId TEXT, turnId TEXT, kind TEXT, status TEXT, startedAt TEXT, completedAt TEXT, content TEXT, reasoning TEXT, toolName TEXT, displayName TEXT, argsJson TEXT, summary TEXT, actionJson TEXT, visualImagesJson TEXT, metaJson TEXT)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	return config.Config{DatabaseURL: "file:" + path}
}

func TestTurnSurvivesDeliveryDisconnectAndStillHonorsInterrupt(t *testing.T) {
	for _, interrupt := range []bool{false, true} {
		t.Run(fmt.Sprint("interrupt=", interrupt), func(t *testing.T) {
			cfg := deliveryConfig(t)
			started := make(chan struct{})
			release := make(chan struct{})
			var calls atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				calls.Add(1)
				close(started)
				select {
				case <-r.Context().Done():
					return
				case <-release:
				}
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"完整分析结果\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n")
			}))
			defer upstream.Close()
			body := `{"turnId":"delivery-turn","threadId":"delivery-thread","model":"gpt-6.1-sol","textProtocol":"openai","enableAgentTools":false,"customBaseUrl":"` + upstream.URL + `","customApiKey":"test-key","messages":[{"role":"user","content":"分析视频"}]}`
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			request := httptest.NewRequest(http.MethodPost, "/api/assistant/turn/start", strings.NewReader(body)).WithContext(ctx)
			response := httptest.NewRecorder()
			done := make(chan struct{})
			go func() { defer close(done); StartTurn(cfg).ServeHTTP(response, request) }()
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("model request never started")
			}
			// Simulate the browser/proxy losing its streaming connection.
			cancel()
			if interrupt {
				interruptWorkspaceTurn(httpx.WorkspaceFrom(request), "delivery-turn")
			} else {
				close(release)
			}
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("turn did not settle")
			}
			snapshot, err := readTurnSnapshot(context.Background(), cfg, httpx.WorkspaceFrom(request), "delivery-turn")
			if err != nil || snapshot == nil {
				t.Fatalf("missing snapshot: %v", err)
			}
			want := "completed"
			if interrupt {
				want = "interrupted"
				if snapshot["error"] != "用户已停止" {
					t.Fatalf("lost interrupt reason: %#v", snapshot)
				}
			}
			if snapshot["status"] != want || calls.Load() != 1 {
				t.Fatalf("status=%v, model calls=%d", snapshot["status"], calls.Load())
			}
			if !interrupt {
				wire, _ := json.Marshal(snapshot)
				if !strings.Contains(string(wire), "完整分析结果") {
					t.Fatal("completed reply was not saved for recovery")
				}
			}
		})
	}
}

func TestTurnHeartbeatAndConcurrentEventsAreValidSSE(t *testing.T) {
	finish := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		send, stop := turnEventStream(r.Context(), w, 5*time.Millisecond)
		defer stop()
		var workers sync.WaitGroup
		for i := 0; i < 30; i++ {
			workers.Add(1)
			go func(i int) { defer workers.Done(); send(map[string]any{"type": "item", "index": i}) }(i)
		}
		workers.Wait()
		<-finish
		send(map[string]any{"type": "done"})
	}))
	defer server.Close()
	client := &http.Client{Timeout: 5 * time.Second}
	response, err := client.Get(server.URL)
	if err != nil {
		close(finish)
		t.Fatal(err)
	}
	defer response.Body.Close()
	items, ping := 0, false
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		if !strings.HasPrefix(scanner.Text(), "data: ") {
			continue
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(scanner.Text(), "data: ")), &event); err != nil {
			close(finish)
			t.Fatal("interleaved SSE records", err)
		}
		if event["type"] == "item" {
			items++
		}
		if event["type"] == "ping" && !ping {
			ping = true
			close(finish)
		}
	}
	if !ping {
		close(finish)
	}
	if scanner.Err() != nil || !ping || items != 30 {
		t.Fatalf("items=%d heartbeat=%v err=%v", items, ping, scanner.Err())
	}
}

type disconnectedWriter struct {
	header http.Header
	writes int
}

func (w *disconnectedWriter) Header() http.Header { return w.header }
func (w *disconnectedWriter) WriteHeader(int)     {}
func (w *disconnectedWriter) Write([]byte) (int, error) {
	w.writes++
	return 0, io.ErrClosedPipe
}

func TestTurnStopsWritingAfterDeliveryFailure(t *testing.T) {
	w := &disconnectedWriter{header: http.Header{}}
	send, stop := turnEventStream(context.Background(), w, time.Hour)
	send(map[string]any{"type": "status"})
	send(map[string]any{"type": "done"})
	stop()
	if w.writes != 1 {
		t.Fatalf("writes after disconnect: %d", w.writes)
	}
}
