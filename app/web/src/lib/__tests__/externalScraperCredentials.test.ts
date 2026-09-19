import { expect, it, vi } from 'vitest';
import { getExternalScraperCredentials } from '../externalScraperCredentials';
import { credentialGet } from '../credentialClient';
vi.mock('../credentialClient', () => ({credentialGet: vi.fn(async (key:string) => `secure-${key}`)}));
it('loads both provider IDs and secrets from secure credentials without legacy localStorage', async () => {
  localStorage.clear();
  expect(await getExternalScraperCredentials()).toEqual({
    scraperId:'secure-external_scraper_id', scraperSecret:'secure-external_scraper_secret',
    qiyunAppId:'secure-qiyun_app_id', qiyunAppKey:'secure-qiyun_app_key',
  });
  expect(credentialGet).toHaveBeenCalledTimes(4);
});
