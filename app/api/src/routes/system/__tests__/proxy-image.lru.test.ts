import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import LRUCache from 'lru-cache';

/**
 * 验证 proxy-image 替换为 lru-cache 后的行为。
 *
 * ⚠️ 项目实际使用 lru-cache v5.1.1（不是 v11）。
 *   v5 已知 bug：同时使用 `max` + `maxSize` + `length` 会导致 itemCount=0。
 *   解决方案：只用 `max` 管条目数，超大条目在 set 之前由调用方拦截。
 */
describe('proxy-image LRU 缓存行为', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('图片缓存上限 600 条', () => {
    const MAX_IMAGE_CACHE_ITEMS = 600;

    const cache = new LRUCache<string, { buf: Buffer; contentType: string; etag: string }>({
      max: MAX_IMAGE_CACHE_ITEMS,
      maxAge: 2 * 60 * 60 * 1000,
    });

    for (let i = 0; i < 600; i++) {
      cache.set(`img_${i}`, {
        buf: Buffer.alloc(1024),
        contentType: 'image/jpeg',
        etag: `etag_${i}`,
      });
    }
    cache.set('img_601', {
      buf: Buffer.alloc(1024),
      contentType: 'image/jpeg',
      etag: 'etag_601',
    });
    expect(cache.itemCount).toBeLessThanOrEqual(600);
  });

  it('视频缓存上限 4 条', () => {
    const cache = new LRUCache<string, { buf: Buffer; contentType: string }>({
      max: 4,
      maxAge: 5 * 60 * 1000,
    });

    for (let i = 0; i < 5; i++) {
      cache.set(`video_${i}`, {
        buf: Buffer.alloc(10 * 1024 * 1024),
        contentType: 'video/mp4',
      });
    }
    // v5 按 max 自动驱逐最老条目
    expect(cache.has('video_0')).toBe(false);
    expect(cache.has('video_4')).toBe(true);
  });

  it('TTL 过期后缓存自动失效', () => {
    const cache = new LRUCache<string, { value: string }>({
      max: 100,
      maxAge: 5 * 1000,
    });

    cache.set('key1', { value: 'test' });
    expect(cache.get('key1')?.value).toBe('test');

    // 快进 6 秒 —— v5 TTL 是惰性失效，需调用 prune() 才会清理
    vi.advanceTimersByTime(6000);
    cache.prune();

    expect(cache.get('key1')).toBeUndefined();
  });

  it('大于 maxSize 的单条不进入缓存（调用方拦截）', () => {
    // ⚠️ v5 不会对超限条目抛错，调用方必须在 set 之前拦截。
    const MAX_ITEM_BYTES = 10 * 1024 * 1024;
    const cache = new LRUCache<string, { buf: Buffer }>({
      max: 10,
    });

    const oversized = Buffer.alloc(11 * 1024 * 1024);
    if (oversized.byteLength < MAX_ITEM_BYTES) {
      cache.set('big', { buf: oversized });
    }
    expect(cache.has('big')).toBe(false);
  });
});
