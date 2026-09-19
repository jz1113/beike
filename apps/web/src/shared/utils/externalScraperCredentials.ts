import { credentialGet } from '@/shared/api/credentialClient';

export type ExternalScraperCredentials = {
  scraperId?: string;
  scraperSecret?: string;
  qiyunAppId?: string;
  qiyunAppKey?: string;
  preferredScraper?: 'auto' | 'qiyun' | 'apia';
};

const CREDENTIAL_KEYS = ['external_scraper_id', 'external_scraper_secret', 'qiyun_app_id', 'qiyun_app_key'] as const;

export async function getExternalScraperCredentials(): Promise<ExternalScraperCredentials> {
  if (typeof window === 'undefined') {
    return {};
  }

  const [scraperId, scraperSecret, qiyunAppId, qiyunAppKey] = await Promise.all(
    CREDENTIAL_KEYS.map((key) => credentialGet(key).then((value) => value.trim())),
  );

  return {
    scraperId: scraperId || undefined,
    scraperSecret: scraperSecret || undefined,
    qiyunAppId: qiyunAppId || undefined,
    qiyunAppKey: qiyunAppKey || undefined,
  };
}

