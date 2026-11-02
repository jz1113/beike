package system

import (
	"context"
	"testing"
	"time"

	"beike.local/cloud/src/backend/internal/config"
)

func TestVideoRegistryBoundsCompletedJobsAndExpiresReceipts(t *testing.T) {
	registry := newVideoJobRegistry(2, time.Hour)
	a, b, c := newVideoDownloadJob("", 1, nil), newVideoDownloadJob("", 1, nil), newVideoDownloadJob("", 1, nil)
	a.finishedAt = time.Now().Add(-time.Minute)
	if !registry.store(a) || !registry.store(b) || !registry.store(c) {
		t.Fatal("failed to store completed jobs")
	}
	if len(registry.items) != 2 || registry.items[a.id] != nil {
		t.Fatal("completed jobs exceeded retention cap")
	}
	if removed := registry.purge(time.Now().Add(2 * time.Hour)); removed != 2 {
		t.Fatalf("expired %d", removed)
	}
}

func TestVideoRegistryNeverEvictsRunningJobs(t *testing.T) {
	registry := newVideoJobRegistry(1, time.Hour)
	a, b := newVideoDownloadJob("", 1, nil), newVideoDownloadJob("", 1, nil)
	a.running = true
	if !registry.store(a) || registry.store(b) {
		t.Fatal("accepted jobs beyond active capacity")
	}
	if removed := registry.purge(time.Now().Add(24 * time.Hour)); removed != 0 {
		t.Fatal("evicted running job")
	}
}

func TestVideoRegistryDrainCancelsWaitsAndRejectsNewStarts(t *testing.T) {
	registry := newVideoJobRegistry(2, time.Hour)
	previous := videoFileSaver
	defer func() { videoFileSaver = previous }()
	entered := make(chan struct{})
	videoFileSaver = func(ctx context.Context, _ config.Config, _, _, _ string) error {
		close(entered)
		<-ctx.Done()
		return ctx.Err()
	}
	job := newVideoDownloadJob("", 1, []videoDownloadItem{{Filename: "test.mp4"}})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	job.cancel, job.running = cancel, true
	if !registry.store(job) {
		t.Fatal("store failed")
	}
	go job.run(ctx, config.Config{})
	<-entered
	shutdown, stop := context.WithTimeout(context.Background(), time.Second)
	defer stop()
	if err := registry.drain(shutdown); err != nil {
		t.Fatal(err)
	}
	if registry.store(newVideoDownloadJob("", 1, nil)) || len(registry.items) != 0 {
		t.Fatal("registry reopened after shutdown")
	}
	if snapshot := job.snapshot(); snapshot.Running || snapshot.Items[0].Status != "pending" {
		t.Fatalf("cancelled job %+v", snapshot)
	}
}
