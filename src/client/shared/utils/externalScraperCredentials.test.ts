import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getPreferredScraperSync,
  setPreferredScraper,
  getExternalScraperCredentials,
} from './externalScraperCredentials';

describe('externalScraperCredentials', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('window', { localStorage: mockStorage });
  });

  it('defaults preferredScraper to auto when nothing stored', () => {
    expect(getPreferredScraperSync()).toBe('auto');
  });

  it('stores and retrieves preferredScraper correctly', () => {
    setPreferredScraper('apia');
    expect(getPreferredScraperSync()).toBe('apia');

    setPreferredScraper('qiyun');
    expect(getPreferredScraperSync()).toBe('qiyun');

    setPreferredScraper('auto');
    expect(getPreferredScraperSync()).toBe('auto');

    setPreferredScraper('wanbang');
    expect(getPreferredScraperSync()).toBe('wanbang');
  });

  it('ignores an unknown preferredScraper value', () => {
    localStorage.setItem('preferred_scraper', 'unknown');
    expect(getPreferredScraperSync()).toBe('auto');
  });

  it('returns preferredScraper in getExternalScraperCredentials', async () => {
    setPreferredScraper('qiyun');
    const creds = await getExternalScraperCredentials();
    expect(creds.preferredScraper).toBe('qiyun');
  });
});
