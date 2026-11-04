package depth

import (
	"beike.local/cloud/src/backend/internal/config"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestConcurrentDepthWaitersShareOneReceipt(t *testing.T) {
	cfg := config.Config{DatabaseURL: "file:" + filepath.Join(t.TempDir(), "depth.db")}
	entered := make(chan struct{})
	release := make(chan struct{})
	results := make(chan string, 4)
	var calls atomic.Int32
	run := func() {
		req := httptest.NewRequest("POST", "/", nil)
		code, body := guardDepth(cfg, req, "depth-video", "shared", "same-input", func() (int, map[string]any) {
			if calls.Add(1) == 1 {
				close(entered)
			}
			<-release
			return 200, map[string]any{"taskId": "one"}
		})
		results <- fmt.Sprint(code, body["taskId"])
	}
	go run()
	<-entered
	for range 3 {
		go run()
	}
	time.Sleep(20 * time.Millisecond)
	close(release)
	for range 4 {
		select {
		case result := <-results:
			if result != "200one" {
				t.Fatal(result)
			}
		case <-time.After(time.Second):
			t.Fatal("waiter did not receive the original receipt")
		}
	}
	if calls.Load() != 1 {
		t.Fatal(calls.Load())
	}
}
