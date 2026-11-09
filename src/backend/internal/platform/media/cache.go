package media

import (
	"container/list"
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"beike.local/cloud/src/backend/internal/platform/storage"
)

type ProxyCacheEntry struct {
	Body        []byte
	ContentType string
	ETag        string
}

type ProxyCacheStats struct {
	Entries int   `json:"entries"`
	Bytes   int64 `json:"bytes"`
}

type cachedProxy struct {
	key     string
	entry   ProxyCacheEntry
	expires time.Time
}

type proxyFetch struct {
	done        chan struct{}
	body        []byte
	contentType string
	err         error
}

// Cached bodies are immutable. The budget covers retained media bytes; the
// separate key limit bounds metadata, and slots bound upstream fetches.
type ProxyCache struct {
	mu              sync.Mutex
	items           map[string]*list.Element
	lru             *list.List
	flights         map[string]*proxyFetch
	slots           chan struct{}
	bytes, maxBytes int64
	maxEntries      int
	ttl             time.Duration
	epoch           uint64
	now             func() time.Time
}

// Called by the API maintenance loop so idle expired bodies are also released.
func (c *ProxyCache) PurgeExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.purge()
}

func NewProxyCache(maxBytes int64, maxEntries int, ttl time.Duration, fetches int) *ProxyCache {
	return &ProxyCache{items: map[string]*list.Element{}, lru: list.New(), flights: map[string]*proxyFetch{}, slots: make(chan struct{}, fetches), maxBytes: maxBytes, maxEntries: maxEntries, ttl: ttl, now: time.Now}
}

func (c *ProxyCache) remove(element *list.Element) {
	item := element.Value.(cachedProxy)
	c.bytes -= int64(len(item.entry.Body))
	delete(c.items, item.key)
	c.lru.Remove(element)
}

func (c *ProxyCache) purge() {
	now := c.now()
	for _, element := range c.items {
		if !now.Before(element.Value.(cachedProxy).expires) {
			c.remove(element)
		}
	}
}

func (c *ProxyCache) Load(key string) (ProxyCacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	element, ok := c.items[key]
	if !ok {
		return ProxyCacheEntry{}, false
	}
	if !c.now().Before(element.Value.(cachedProxy).expires) {
		c.remove(element)
		return ProxyCacheEntry{}, false
	}
	c.lru.MoveToFront(element)
	return element.Value.(cachedProxy).entry, true
}

func (c *ProxyCache) store(key string, entry ProxyCacheEntry) {
	c.purge()
	if element, ok := c.items[key]; ok {
		c.remove(element)
	}
	if int64(len(entry.Body)) > c.maxBytes || c.maxEntries <= 0 {
		return
	}
	for c.lru.Len() > 0 && (c.bytes+int64(len(entry.Body)) > c.maxBytes || c.lru.Len() >= c.maxEntries) {
		c.remove(c.lru.Back())
	}
	c.items[key] = c.lru.PushFront(cachedProxy{key, entry, c.now().Add(c.ttl)})
	c.bytes += int64(len(entry.Body))
}

func (c *ProxyCache) Store(key string, entry ProxyCacheEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store(key, entry)
}

func (c *ProxyCache) Stats() ProxyCacheStats {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.purge()
	return ProxyCacheStats{len(c.items), c.bytes}
}

func (c *ProxyCache) Clear() ProxyCacheStats {
	c.mu.Lock()
	defer c.mu.Unlock()
	cleared := ProxyCacheStats{len(c.items), c.bytes}
	c.items = map[string]*list.Element{}
	c.lru.Init()
	c.bytes = 0
	c.epoch++
	return cleared
}

func (c *ProxyCache) Fetch(ctx context.Context, key string, load func() ([]byte, string, bool)) ([]byte, string, bool) {
	body, contentType, err := c.FetchWithError(ctx, key, func() ([]byte, string, error) {
		body, contentType, ok := load()
		if !ok {
			return body, contentType, errors.New("media fetch failed")
		}
		return body, contentType, nil
	})
	return body, contentType, err == nil
}

// FetchWithError shares upstream failures with concurrent waiters without caching them.
func (c *ProxyCache) FetchWithError(ctx context.Context, key string, load func() ([]byte, string, error)) ([]byte, string, error) {
	if ctx.Err() != nil {
		return nil, "", ctx.Err()
	}
	c.mu.Lock()
	if element, ok := c.items[key]; ok && c.now().Before(element.Value.(cachedProxy).expires) {
		c.lru.MoveToFront(element)
		entry := element.Value.(cachedProxy).entry
		c.mu.Unlock()
		return entry.Body, entry.ContentType, nil
	}
	if flight, ok := c.flights[key]; ok {
		c.mu.Unlock()
		return waitFlight(ctx, flight)
	}
	c.mu.Unlock()

	// Acquire capacity before registering a flight so waiting requests cannot
	// create an unbounded map of in-flight keys.
	select {
	case c.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}
	c.mu.Lock()
	if element, ok := c.items[key]; ok && c.now().Before(element.Value.(cachedProxy).expires) {
		c.lru.MoveToFront(element)
		entry := element.Value.(cachedProxy).entry
		c.mu.Unlock()
		<-c.slots
		return entry.Body, entry.ContentType, nil
	}
	if flight, ok := c.flights[key]; ok {
		c.mu.Unlock()
		<-c.slots
		return waitFlight(ctx, flight)
	}
	flight := &proxyFetch{done: make(chan struct{})}
	c.flights[key] = flight
	epoch := c.epoch
	c.mu.Unlock()
	defer func() { <-c.slots }()

	body, contentType, err := load()
	c.mu.Lock()
	if err == nil && epoch == c.epoch {
		c.store(key, ProxyCacheEntry{Body: body, ContentType: contentType})
	}
	flight.body, flight.contentType, flight.err = body, contentType, err
	delete(c.flights, key)
	close(flight.done)
	c.mu.Unlock()
	return body, contentType, err
}

func waitFlight(ctx context.Context, flight *proxyFetch) ([]byte, string, error) {
	select {
	case <-flight.done:
		return flight.body, flight.contentType, flight.err
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}
}

// RemoteMediaHeaders matches the browser preview request closely enough for
// retail CDNs to return the picture instead of an anti-hotlink page.
func RemoteMediaHeaders(rawURL, accept string) map[string]string {
	headers := map[string]string{
		"User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		"Accept":          accept,
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return headers
	}
	host := strings.ToLower(parsed.Hostname())
	for _, rule := range []struct{ suffix, referer string }{
		{"xhscdn.com", "https://www.xiaohongshu.com/"},
		{"xiaohongshu.com", "https://www.xiaohongshu.com/"},
		{"douyinpic.com", "https://www.douyin.com/"},
		{"snssdk.com", "https://www.douyin.com/"},
		{"bytecdn.cn", "https://www.douyin.com/"},
		{"360buyimg.com", "https://www.jd.com/"},
		{"jd.com", "https://www.jd.com/"},
		{"alicdn.com", "https://www.taobao.com/"},
		{"tbcdn.cn", "https://www.taobao.com/"},
		{"taobao.com", "https://www.taobao.com/"},
		{"tmall.com", "https://www.taobao.com/"},
		{"pddpic.com", "https://mobile.yangkeduo.com/"},
		{"yangkeduo.com", "https://mobile.yangkeduo.com/"},
		{"kuaishou.com", "https://www.kuaishou.com/"},
		{"yximgs.com", "https://www.kuaishou.com/"},
		{"kwimgs.com", "https://www.kuaishou.com/"},
	} {
		if host == rule.suffix || strings.HasSuffix(host, "."+rule.suffix) {
			headers["Referer"] = rule.referer
			break
		}
	}
	return headers
}

// RemoteImageHeaders asks only for formats the vision pipeline can decode.
func RemoteImageHeaders(rawURL string) map[string]string {
	return RemoteMediaHeaders(rawURL, "image/jpeg,image/png,image/webp,image/gif,image/*;q=0.8,*/*;q=0.5")
}

// Inline protected retail/social images; public signed URLs retain their bytes.
func RemoteImageNeedsInline(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if strings.HasSuffix(strings.ToLower(u.Path), ".octet-stream") {
		return true
	}
	return RemoteImageHeaders(raw)["Referer"] != ""
}

// VisionImageURL keeps public URLs intact and embeds local originals for remote models.
func VisionImageURL(root, source string) (string, error) {
	source = normalizeLocalVisionSource(source)
	if strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "data:image/") {
		return source, nil
	}
	if root == "" || !strings.HasPrefix(source, "/storage/") {
		return "", errors.New("图片来源无法读取")
	}
	relPath := strings.TrimPrefix(source, "/storage/")
	relPath = strings.SplitN(relPath, "?", 2)[0]
	relPath = strings.SplitN(relPath, "#", 2)[0]
	file := storage.SafeWithin(root, relPath)
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil || file == "" {
		return "", errors.New("图片来源无法读取")
	}
	realFile, err := filepath.EvalSymlinks(file)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(realRoot, realFile)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", errors.New("图片来源超出素材目录")
	}
	handle, err := os.Open(realFile)
	if err != nil {
		return "", err
	}
	defer handle.Close()
	body, err := io.ReadAll(io.LimitReader(handle, (12<<20)+1))
	if err != nil || len(body) == 0 || len(body) > 12<<20 {
		return "", errors.New("本地原图为空或超过 12 MB")
	}
	mime := http.DetectContentType(body)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" && mime != "image/gif" {
		return "", errors.New("请使用 JPEG、PNG、WebP 或 GIF 原图")
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(body), nil
}

func normalizeLocalVisionSource(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if !strings.HasPrefix(strings.ToLower(trimmed), "http://") && !strings.HasPrefix(strings.ToLower(trimmed), "https://") {
		return trimmed
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.User != nil || !strings.HasPrefix(parsed.Path, "/storage/") {
		return trimmed
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return parsed.Path
	}
	return trimmed
}
