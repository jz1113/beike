package media

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestProxyCacheBudgetTTLAndClear(t *testing.T) {
	c := NewProxyCache(6, 2, time.Minute, 2)
	now := time.Now()
	c.now = func() time.Time { return now }
	c.Store("a", ProxyCacheEntry{Body: []byte("aaa")})
	c.Store("b", ProxyCacheEntry{Body: []byte("bbb")})
	if _, ok := c.Load("a"); !ok {
		t.Fatal("cache miss")
	}
	c.Store("c", ProxyCacheEntry{Body: []byte("ccc")})
	if _, ok := c.Load("b"); ok {
		t.Fatal("did not evict least recently used entry")
	}
	c.Store("large", ProxyCacheEntry{Body: []byte("1234567")})
	if stats := c.Stats(); stats.Bytes != 6 || stats.Entries != 2 {
		t.Fatalf("budget %+v", stats)
	}
	now = now.Add(time.Minute)
	if _, ok := c.Load("a"); ok {
		t.Fatal("expired entry served")
	}
	if stats := c.Stats(); stats.Bytes != 0 || stats.Entries != 0 {
		t.Fatalf("expired stats %+v", stats)
	}
	c.Store("new", ProxyCacheEntry{Body: []byte("new")})
	if cleared := c.Clear(); cleared.Bytes != 3 || c.Stats().Entries != 0 {
		t.Fatalf("clear %+v", cleared)
	}
}

func TestProxyCacheCoalescesFetchAndDoesNotCacheFailures(t *testing.T) {
	c := NewProxyCache(128, 8, time.Minute, 2)
	var calls atomic.Int32
	entered, release := make(chan struct{}), make(chan struct{})
	load := func() ([]byte, string, bool) {
		if calls.Add(1) == 1 {
			close(entered)
		}
		<-release
		return []byte("image"), "image/jpeg", true
	}
	var group sync.WaitGroup
	for range 12 {
		group.Add(1)
		go func() {
			defer group.Done()
			body, _, ok := c.Fetch(context.Background(), "same", load)
			if !ok || string(body) != "image" {
				t.Error("fetch failed")
			}
		}()
	}
	<-entered
	close(release)
	group.Wait()
	if calls.Load() != 1 {
		t.Fatalf("upstream calls %d", calls.Load())
	}
	for range 2 {
		c.Fetch(context.Background(), "failure", func() ([]byte, string, bool) { calls.Add(1); return nil, "", false })
	}
	if calls.Load() != 3 {
		t.Fatal("cached failure")
	}
}

func TestProxyCacheCancelledWaiterDoesNotCancelLeader(t *testing.T) {
	c := NewProxyCache(128, 8, time.Minute, 1)
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		c.Fetch(context.Background(), "a", func() ([]byte, string, bool) { close(entered); <-release; return []byte("a"), "image/jpeg", true })
	}()
	<-entered
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, ok := c.Fetch(ctx, "a", func() ([]byte, string, bool) { t.Error("second loader called"); return nil, "", false }); ok {
		t.Fatal("cancelled waiter succeeded")
	}
	c.Clear()
	close(release)
	<-done
	if c.Stats().Entries != 0 {
		t.Fatal("in-flight request repopulated cleared cache")
	}
}
