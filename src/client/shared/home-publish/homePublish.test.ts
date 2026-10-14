import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isMediaPublishedOnHome, publishMediaResult, readPublishedHomeItems, unpublishMediaFromHome } from './homePublish';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  });
});

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
});
