import { credentialGet } from '@client/shared/api/credentialClient';

export type PreferredScraper = 'auto' | 'qiyun' | 'apia' | 'wanbang';

const PREFERRED_SCRAPERS = new Set<PreferredScraper>(['auto', 'qiyun', 'apia', 'wanbang']);

export type ExternalScraperCredentials = {
  scraperId?: string;
  scraperSecret?: string;
  qiyunAppId?: string;
  qiyunAppKey?: string;
  preferredScraper?: PreferredScraper;
};

const CREDENTIAL_KEYS = ['external_scraper_id', 'external_scraper_secret', 'qiyun_app_id', 'qiyun_app_key'] as const;
const PREFERRED_SCRAPER_STORAGE_KEY = 'preferred_scraper';

export function getPreferredScraperSync(): PreferredScraper {
  if (typeof window === 'undefined') return 'auto';
  try {
    const val = localStorage.getItem(PREFERRED_SCRAPER_STORAGE_KEY);
    if (val && PREFERRED_SCRAPERS.has(val as PreferredScraper)) return val as PreferredScraper;
  } catch {
    // 忽略 localStorage 读取异常
  }
  return 'auto';
}

export function setPreferredScraper(engine: PreferredScraper): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFERRED_SCRAPER_STORAGE_KEY, engine);
  } catch {
    // 忽略 localStorage 写入异常
  }
}

export async function getExternalScraperCredentials(): Promise<ExternalScraperCredentials> {
  if (typeof window === 'undefined') {
    return { preferredScraper: 'auto' };
  }

  const [scraperId, scraperSecret, qiyunAppId, qiyunAppKey] = await Promise.all(
    CREDENTIAL_KEYS.map((key) => credentialGet(key).then((value) => value.trim())),
  );

  return {
    scraperId: scraperId || undefined,
    scraperSecret: scraperSecret || undefined,
    qiyunAppId: qiyunAppId || undefined,
    qiyunAppKey: qiyunAppKey || undefined,
    preferredScraper: getPreferredScraperSync(),
  };
}

