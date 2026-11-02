package system

import (
	"context"
	"sync"
	"time"
)

// Completed job receipts stay available for one hour, within a fixed total
// count. Running jobs are never evicted; new starts receive backpressure.
type videoJobRegistry struct {
	sync.Mutex
	items  map[string]*videoDownloadJob
	limit  int
	ttl    time.Duration
	closed bool
}

var videoDownloadJobs = newVideoJobRegistry(128, time.Hour)

func newVideoJobRegistry(limit int, ttl time.Duration) *videoJobRegistry {
	return &videoJobRegistry{items: map[string]*videoDownloadJob{}, limit: limit, ttl: ttl}
}

func (registry *videoJobRegistry) purge(now time.Time) int {
	removed := 0
	for id, job := range registry.items {
		job.mu.Lock()
		expired := !job.running && !now.Before(job.finishedAt.Add(registry.ttl))
		job.mu.Unlock()
		if expired {
			delete(registry.items, id)
			removed++
		}
	}
	return removed
}

func (registry *videoJobRegistry) store(job *videoDownloadJob) bool {
	registry.Lock()
	defer registry.Unlock()
	if registry.closed {
		return false
	}
	registry.purge(time.Now())
	if len(registry.items) >= registry.limit {
		var oldest *videoDownloadJob
		var oldestAt time.Time
		for _, candidate := range registry.items {
			candidate.mu.Lock()
			if !candidate.running && (oldest == nil || candidate.finishedAt.Before(oldestAt)) {
				oldest, oldestAt = candidate, candidate.finishedAt
			}
			candidate.mu.Unlock()
		}
		if oldest == nil {
			return false
		}
		delete(registry.items, oldest.id)
	}
	registry.items[job.id] = job
	return true
}

func storeVideoDownloadJob(job *videoDownloadJob) bool { return videoDownloadJobs.store(job) }

func lookupVideoDownloadJob(id string) (*videoDownloadJob, bool) {
	videoDownloadJobs.Lock()
	defer videoDownloadJobs.Unlock()
	videoDownloadJobs.purge(time.Now())
	job, ok := videoDownloadJobs.items[id]
	return job, ok
}

func PurgeExpiredVideoDownloads(now time.Time) int {
	videoDownloadJobs.Lock()
	defer videoDownloadJobs.Unlock()
	return videoDownloadJobs.purge(now)
}

func (registry *videoJobRegistry) drain(ctx context.Context) error {
	registry.Lock()
	registry.closed = true
	jobs := make([]*videoDownloadJob, 0, len(registry.items))
	for _, job := range registry.items {
		jobs = append(jobs, job)
	}
	registry.Unlock()
	for _, job := range jobs {
		if job.cancel != nil {
			job.cancel()
		}
	}
	for _, job := range jobs {
		job.mu.Lock()
		running := job.running
		job.mu.Unlock()
		if running {
			select {
			case <-job.done:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	registry.Lock()
	registry.items = map[string]*videoDownloadJob{}
	registry.Unlock()
	return nil
}

func DrainVideoDownloads(ctx context.Context) error { return videoDownloadJobs.drain(ctx) }
