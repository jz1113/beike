import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_PUBLISHED_EVENT, HOME_PUBLISHED_STORAGE_KEY, isMediaPublishedOnHome, publishCanvasResult, unpublishCanvasResult, publishMediaResult, readPublishedHomeItems, unpublishMediaFromHome } from './homePublish';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('home showcase publish', () => {
  it('matches a proxied image url and removes it again', () => {
    const url = 'https://cdn.example.com/a.png';
    publishMediaResult({ id: 'task-1', prompt: '封面', title: '封面标题', url, mediaType: 'image' });
    const proxy = `http://127.0.0.1:5173/api/system/proxy-image?url=${encodeURIComponent(url)}&thumb=1&w=960`;
    expect(isMediaPublishedOnHome(proxy)).toBe(true);
    expect(readPublishedHomeItems()[0]?.title).toBe('封面标题');
    unpublishMediaFromHome(proxy);
    expect(isMediaPublishedOnHome(url)).toBe(false);
  });

  it('recognizes a same-origin absolute URL as the stored relative URL', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5173' }, dispatchEvent: vi.fn() });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} });
    publishMediaResult({ id: 'relative', url: '/storage/image.png', prompt: '' });
    expect(isMediaPublishedOnHome('http://127.0.0.1:5173/storage/image.png?thumb=1&w=960')).toBe(true);
    unpublishMediaFromHome('http://127.0.0.1:5173/storage/image.png');
    expect(readPublishedHomeItems()).toEqual([]);
  });

  it('normalizes legacy records and ignores malformed or duplicate identifiers without rewriting storage', () => {
    const raw = JSON.stringify([
      { id: 'legacy', image: '/legacy.mp4', publishedKind: 'media', prompt: 12, title: { invalid: true }, poster: 1 },
      { id: 'legacy', image: '/duplicate.png', publishedKind: 'media' },
      { id: '', image: '/empty.png', publishedKind: 'media' },
      { id: 'blank', image: '', publishedKind: 'media' },
      null,
    ]);
    memory.set(HOME_PUBLISHED_STORAGE_KEY, raw);
    expect(readPublishedHomeItems()).toEqual([expect.objectContaining({ id: 'legacy', title: '生成视频', prompt: '', poster: undefined, mediaType: 'video' })]);
    expect(memory.get(HOME_PUBLISHED_STORAGE_KEY)).toBe(raw);
  });

  it('keeps valid legacy canvas nodes and rejects invalid geometry and reference identifiers', () => {
    const valid = { id: 'n', type: 'image', x: -100, y: 200, width: 500, height: 800, referenceNodeIds: ['source'] };
    memory.set(HOME_PUBLISHED_STORAGE_KEY, JSON.stringify([{ id: 'canvas', image: '/cover.png', publishedKind: 'canvas', canvasNodes: [valid, { ...valid, width: 0 }, { ...valid, x: 'broken' }, { ...valid, referenceNodeIds: [null] }] }]));
    expect(readPublishedHomeItems()[0].canvasNodes).toEqual([valid]);
  });

  it('returns an empty catalogue for corrupt storage', () => {
    for (const value of ['{broken', '{}', 'null']) {
      memory.set(HOME_PUBLISHED_STORAGE_KEY, value);
      expect(readPublishedHomeItems()).toEqual([]);
    }
  });

  it('updates one snapshot per canvas and keeps it separate from media publication', () => {
    const node = { id: 'n', type: 'note', x: 0, y: 0, width: 100, height: 100 };
    const item = { id: '', projectId: 'p', image: '/one.mp4', video: '/one.mp4', publishedKind: 'canvas' as const,
      category: 'video', tag: '画布', title: '初版', prompt: '', canvasNodes: [node] };
    publishCanvasResult(item);
    publishMediaResult({ id: 'media', url: '/one.mp4', prompt: '' });
    unpublishMediaFromHome('/one.mp4');
    expect(readPublishedHomeItems()).toHaveLength(1);
    publishCanvasResult({ ...item, title: '更新', video: '/two.mp4', selectedVideoKey: 'n:current' });
    expect(readPublishedHomeItems()).toEqual([expect.objectContaining({ title: '更新', video: '/two.mp4', image: '/two.mp4', projectId: 'p' })]);
    unpublishCanvasResult('p');
    expect(readPublishedHomeItems()).toEqual([]);
  });

  it('keeps the old canvas snapshot if updating storage fails', () => {
    const item = { id: '', projectId: 'p', image: '/one.mp4', video: '/one.mp4', publishedKind: 'canvas' as const,
      category: 'video', tag: '画布', title: '初版', prompt: '', canvasNodes: [{ id: 'n', type: 'note', x: 0, y: 0, width: 100, height: 100 }] };
    publishCanvasResult(item);
    const previous = memory.get(HOME_PUBLISHED_STORAGE_KEY);
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: () => { throw new Error('quota'); } });
    expect(() => publishCanvasResult({ ...item, title: '更新' })).toThrow('首页展示保存失败');
    expect(memory.get(HOME_PUBLISHED_STORAGE_KEY)).toBe(previous);
  });

  it('reports storage failure and never emits a false publish-success event', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { location: { origin: 'http://local.test' }, dispatchEvent });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(() => publishMediaResult({ id: 'quota', url: '/image.png', prompt: '' })).toThrow('首页展示保存失败');
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: HOME_PUBLISHED_EVENT }));
  });
});
