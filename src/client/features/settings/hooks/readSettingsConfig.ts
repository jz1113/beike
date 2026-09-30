import { credentialGet } from '@client/shared/api/credentialClient';
import { waitForCredentialSaves } from '@client/shared/api/persistCredentials';

export type StorageProvider = 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
const providers: readonly string[] = ['r2', 'oss', 'cos', 's3', 'minio', 'supabase'];

export async function readSettingsConfig() {
  await waitForCredentialSaves();
  const read = (key: string, fallback = '') => localStorage.getItem(key) || fallback;
  const rawProvider = read('storage_provider');
  const metadata = {
    baseUrl: read('ai_base_url', 'https://ai.comfly.org'),
    isWanbangEnabled: read('wanbang_enabled') !== 'false',
    isApiaEnabled: read('apia_enabled') !== 'false',
    isQiyunEnabled: read('qiyun_enabled') !== 'false',
    appAccessToken: read('app_access_token', 'azhuo-local-dev'),
    storageEnabled: read('storage_enabled') === 'true',
    storageProvider: (providers.includes(rawProvider) ? rawProvider : 'oss') as StorageProvider,
    storageAccountId: read('storage_account_id'), storageEndpoint: read('storage_endpoint'),
    storageAccessKeyId: read('storage_access_key_id'), storageBucketName: read('storage_bucket_name'),
    storagePublicDomain: read('storage_public_domain'),
  };
  const [apiKey, deepSeekApiKey, wanbangKey, wanbangSecret, scraperId, scraperSecret, qiyunAppId, qiyunAppKey, storageSecretAccessKey] = await Promise.all([
    credentialGet('ai_api_key', true), credentialGet('deepseek_api_key', true),
    credentialGet('wanbang_api_key', true), credentialGet('wanbang_api_secret', true),
    credentialGet('external_scraper_id', true), credentialGet('external_scraper_secret', true),
    credentialGet('qiyun_app_id', true), credentialGet('qiyun_app_key', true),
    credentialGet('storage_secret_access_key', true),
  ]);
  return { ...metadata, apiKey, deepSeekApiKey, wanbangKey, wanbangSecret, scraperId, scraperSecret, qiyunAppId, qiyunAppKey, storageSecretAccessKey };
}

export type SettingsConfigSnapshot = Awaited<ReturnType<typeof readSettingsConfig>>;

export function settingsConfigFingerprint(config: SettingsConfigSnapshot): string {
  return JSON.stringify(Object.entries(config).filter(([key]) => key !== 'appAccessToken')
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
}
