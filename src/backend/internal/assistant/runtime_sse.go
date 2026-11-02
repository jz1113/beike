package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Heartbeats cover frame preparation and silent model reasoning. All writes,
// including parallel tool events, share one lock to keep SSE records intact.
func turnEventStream(ctx context.Context, w http.ResponseWriter, interval time.Duration) (func(map[string]any), func()) {
	var mu sync.Mutex
	connected := true
	flusher, _ := w.(http.Flusher)
	send := func(event map[string]any) {
		mu.Lock()
		defer mu.Unlock()
		if connected {
			// Bound a blocked socket write without changing the model deadline.
			_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(15 * time.Second))
			connected = writeSSE(w, flusher, event) == nil
		}
	}
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-stop:
				return
			case <-ticker.C:
				send(map[string]any{"type": "ping"})
			}
		}
	}()
	return send, func() { close(stop); <-done }
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, events ...map[string]any) error {
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
	}
	for _, event := range events {
		body, err := json.Marshal(event)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", body); err != nil {
			return err
		}
	}
	if flusher != nil {
		return http.NewResponseController(w).Flush()
	}
	return nil
}
