import { credentialGet } from '@/lib/credentialClient';

export type ExternalScraperCredentials = {
  scraperId?: string;
  scraperSecret?: string;
  qiyunAppId?: string;
  qiyunAppKey?: string;
  preferredScraper?: 'auto' | 'qiyun' | 'apia';
};

export async function getExternalScraperCredentials(): Promise<ExternalScraperCredentials> {
  if (typeof window === 'undefined') {
    return {};
  }

  const localId = (localStorage.getItem('external_scraper_id') || '').trim();
  const secureSecret = (await credentialGet('external_scraper_secret')).trim();
  const localSecret = (localStorage.getItem('external_scraper_secret') || '').trim();

  const qiyunAppId = (localStorage.getItem('qiyun_app_id') || '').trim();
  const secureQiyunKey = (await credentialGet('qiyun_app_key')).trim();
  const localQiyunKey = (localStorage.getItem('qiyun_app_key') || '').trim();

  return {
    scraperId: localId || undefined,
    scraperSecret: secureSecret || localSecret || undefined,
    qiyunAppId: qiyunAppId || undefined,
    qiyunAppKey: secureQiyunKey || localQiyunKey || undefined,
  };
}

