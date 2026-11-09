package media

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
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

func TestProxyCacheRetainsFailureIdentityWithoutCachingIt(t *testing.T) {
	c := NewProxyCache(128, 8, time.Minute, 2)
	missing := errors.New("remote image missing")
	calls := 0
	load := func() ([]byte, string, error) { calls++; return nil, "", missing }
	for range 2 {
		if _, _, err := c.FetchWithError(context.Background(), "missing", load); !errors.Is(err, missing) {
			t.Fatalf("lost upstream failure: %v", err)
		}
	}
	if calls != 2 || c.Stats().Entries != 0 {
		t.Fatal("cached failed image")
	}
}

func TestProxyCacheServesHitsAndCoalescesWhileSlotsExhausted(t *testing.T) {
	c := NewProxyCache(128, 8, time.Minute, 2)
	c.Store("hot", ProxyCacheEntry{Body: []byte("cached-hot"), ContentType: "image/png"})

	entered1, entered2, release := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var done sync.WaitGroup
	done.Add(2)
	go func() {
		defer done.Done()
		c.Fetch(context.Background(), "slow-1", func() ([]byte, string, bool) {
			close(entered1)
			<-release
			return []byte("1"), "image/png", true
		})
	}()
	go func() {
		defer done.Done()
		c.Fetch(context.Background(), "slow-2", func() ([]byte, string, bool) {
			close(entered2)
			<-release
			return []byte("2"), "image/png", true
		})
	}()
	<-entered1
	<-entered2

	// 即使 2 个上游并发槽已被 slow-1 / slow-2 占满，已缓存的 "hot" 仍应立即返回而不阻塞
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	body, contentType, err := c.FetchWithError(ctx, "hot", func() ([]byte, string, error) {
		t.Error("unexpected upstream load for cached key")
		return nil, "", errors.New("unexpected")
	})
	if err != nil || string(body) != "cached-hot" || contentType != "image/png" {
		t.Fatalf("expected immediate cache hit while slots full, got body=%q type=%q err=%v", body, contentType, err)
	}

	// 同键 waiter 也不应额外抢占槽位，应在 release 后拿到合并结果
	waiterDone := make(chan error, 1)
	go func() {
		b, _, e := c.FetchWithError(context.Background(), "slow-1", func() ([]byte, string, error) {
			return nil, "", errors.New("should coalesce with in-flight slow-1")
		})
		if e == nil && string(b) != "1" {
			e = errors.New("unexpected coalesced body")
		}
		waiterDone <- e
	}()

	close(release)
	if err := <-waiterDone; err != nil {
		t.Fatalf("coalesced waiter failed: %v", err)
	}
	done.Wait()
}

func TestRemoteImageHeadersUseRetailRefererWithoutAvif(t *testing.T) {
	ali := RemoteImageHeaders("https://img.alicdn.com/bao/uploaded/a.jpg")
	if ali["Referer"] != "https://www.taobao.com/" || !strings.Contains(ali["User-Agent"], "Mozilla") || strings.Contains(ali["Accept"], "avif") {
		t.Fatalf("ali headers %#v", ali)
	}
	jd := RemoteImageHeaders("https://img10.360buyimg.com/n0/a.jpg")
	if jd["Referer"] != "https://www.jd.com/" {
		t.Fatalf("jd referer %s", jd["Referer"])
	}
	plain := RemoteImageHeaders("https://cdn.example/a.jpg")
	if _, ok := plain["Referer"]; ok || plain["Accept"] == "" {
		t.Fatalf("plain headers %#v", plain)
	}
	video := RemoteMediaHeaders("https://img.alicdn.com/a.mp4", "*/*")
	if video["Accept"] != "*/*" || video["Referer"] != "https://www.taobao.com/" {
		t.Fatalf("video headers %#v", video)
	}
}

func TestProtectedImageInlinePolicyMatchesRetailHeaders(t *testing.T) {
	for _, host := range []string{"sns-img-hw.xhscdn.com", "img10.360buyimg.com", "img.alicdn.com", "img.tbcdn.cn", "img.pddpic.com", "img.douyinpic.com"} {
		source := "https://" + host + "/original.jpg?signature=kept"
		if !RemoteImageNeedsInline(source) || RemoteImageHeaders(source)["Referer"] == "" {
			t.Fatalf("protected CDN not prepared: %s", host)
		}
	}
	if RemoteImageNeedsInline("https://xhscdn.com.evil.example/image.jpg") {
		t.Fatal("suffix spoof accepted")
	}
	if RemoteImageNeedsInline("https://public.example/image.jpg?signature=kept") {
		t.Fatal("public signed image unnecessarily rewritten")
	}
}

func TestVisionReadsLocalOriginalsAndKeepsRemoteSignatures(t *testing.T) {
	root := t.TempDir()
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	if err := os.WriteFile(filepath.Join(root, "original.png"), png, 0600); err != nil {
		t.Fatal(err)
	}
	result, err := VisionImageURL(root, "/storage/original.png")
	if err != nil || !strings.HasPrefix(result, "data:image/png;base64,") {
		t.Fatalf("local original not embedded: %s %v", result, err)
	}
	signed := "https://example.com/original.png?signature=x%2Fy&size=original"
	if got, err := VisionImageURL(root, signed); err != nil || got != signed {
		t.Fatal("signed remote URL rewritten")
	}
	for _, value := range []string{"/storage/../secret.env", "/storage/C:/secret", "/storage/missing.png", "/arbitrary/file"} {
		if _, err := VisionImageURL(root, value); err == nil {
			t.Fatalf("invalid local image accepted: %s", value)
		}
	}
}
