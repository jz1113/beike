package sales

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSummaryImagesBoundConcurrencyAndKeepSourceOrder(t *testing.T) {
	input := summaryInput{}
	for i := range 6 {
		input.ReferenceImages = append(input.ReferenceImages, summaryImage{Index: i, URL: fmt.Sprintf("https://image.test/%d", i)})
	}
	input.TextImages = []summaryImage{input.ReferenceImages[0]}
	var active, maximum, reads atomic.Int64
	started, release := make(chan struct{}, 6), make(chan struct{})
	var releaseOnce sync.Once
	t.Cleanup(func() { releaseOnce.Do(func() { close(release) }) })
	type response struct {
		images []preparedSummaryImage
		err    error
	}
	done := make(chan response, 1)
	go func() {
		images, err := prepareSummaryImages(context.Background(), input, "workspace-a", func(ctx context.Context, url, workspace string) ([]byte, error) {
			reads.Add(1)
			current := active.Add(1)
			defer active.Add(-1)
			for old := maximum.Load(); current > old && !maximum.CompareAndSwap(old, current); old = maximum.Load() {
			}
			started <- struct{}{}
			<-release
			if workspace != "workspace-a" {
				return nil, errors.New("workspace lost")
			}
			return []byte(url), nil
		})
		done <- response{images, err}
	}()
	for range 3 {
		select {
		case <-started:
		case <-time.After(2 * time.Second):
			t.Fatal("image downloads are serialized")
		}
	}
	releaseOnce.Do(func() { close(release) })
	result := <-done
	if result.err != nil || maximum.Load() != 3 || reads.Load() != 6 {
		t.Fatalf("err=%v max=%d reads=%d", result.err, maximum.Load(), reads.Load())
	}
	for i, image := range result.images {
		if image.Index != i || !strings.HasPrefix(image.URL, "data:") {
			t.Fatal("source order changed")
		}
	}
}

func TestSummaryImageFailureCancelsOtherDownloads(t *testing.T) {
	input := summaryInput{ReferenceImages: []summaryImage{{Index: 0, URL: "bad"}, {Index: 1, URL: "waiting"}}}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err := prepareSummaryImages(ctx, input, "local", func(ctx context.Context, url, workspace string) ([]byte, error) {
		if url == "bad" {
			return nil, errors.New("source unavailable")
		}
		<-ctx.Done()
		return nil, ctx.Err()
	})
	if err == nil || !strings.Contains(err.Error(), "source unavailable") || ctx.Err() != nil {
		t.Fatalf("did not promptly stop other downloads: %v", err)
	}
}
