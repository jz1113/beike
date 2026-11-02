package sales

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
)

type preparedSummaryImage struct {
	Index int
	URL   string
}

// Download a small bounded batch concurrently, retaining catalog order and one shared byte budget.
func prepareSummaryImages(ctx context.Context, input summaryInput, workspace string, read summaryImageReader) ([]preparedSummaryImage, error) {
	images := []summaryImage{}
	seen := map[string]bool{}
	for _, image := range append(append([]summaryImage{}, input.ReferenceImages...), input.TextImages...) {
		if !seen[image.URL] {
			images = append(images, image)
			seen[image.URL] = true
		}
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	prepared := make([]preparedSummaryImage, len(images))
	var cursor, total atomic.Int64
	var workers sync.WaitGroup
	var first sync.Once
	var firstErr error
	fail := func(err error) { first.Do(func() { firstErr = err; cancel() }) }
	for range min(3, len(images)) {
		workers.Go(func() {
			for {
				position := int(cursor.Add(1)) - 1
				if position >= len(images) || ctx.Err() != nil {
					return
				}
				image := images[position]
				original, err := read(ctx, image.URL, workspace)
				if err != nil {
					fail(fmt.Errorf("图片 #%d 无法读取：%w", image.Index+1, err))
					return
				}
				if total.Add(int64(len(original))) > 20<<20 {
					fail(fmt.Errorf("所选原图合计超过 20 MB，请减少图片后重试"))
					return
				}
				prepared[position] = preparedSummaryImage{Index: image.Index, URL: "data:" + http.DetectContentType(original) + ";base64," + base64.StdEncoding.EncodeToString(original)}
			}
		})
	}
	workers.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return prepared, nil
}
