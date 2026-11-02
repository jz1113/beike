package media

import (
	"container/list"
	"context"
	"sync"
	"time"
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
	ok          bool
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
	if ctx.Err() != nil {
		return nil, "", false
	}
	// Acquire capacity before registering a flight so waiting requests cannot
	// create an unbounded map of in-flight keys.
	select {
	case c.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, "", false
	}
	defer func() { <-c.slots }()
	c.mu.Lock()
	if element, ok := c.items[key]; ok && c.now().Before(element.Value.(cachedProxy).expires) {
		c.lru.MoveToFront(element)
		entry := element.Value.(cachedProxy).entry
		c.mu.Unlock()
		return entry.Body, entry.ContentType, true
	}
	if flight, ok := c.flights[key]; ok {
		c.mu.Unlock()
		select {
		case <-flight.done:
			return flight.body, flight.contentType, flight.ok
		case <-ctx.Done():
			return nil, "", false
		}
	}
	flight := &proxyFetch{done: make(chan struct{})}
	c.flights[key] = flight
	epoch := c.epoch
	c.mu.Unlock()
	body, contentType, ok := load()
	c.mu.Lock()
	if ok && epoch == c.epoch {
		c.store(key, ProxyCacheEntry{Body: body, ContentType: contentType})
	}
	flight.body, flight.contentType, flight.ok = body, contentType, ok
	delete(c.flights, key)
	close(flight.done)
	c.mu.Unlock()
	return body, contentType, ok
}
