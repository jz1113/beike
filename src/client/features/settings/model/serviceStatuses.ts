import { resolveServiceStatus, type ConnectionTestRecord } from './connectionStatus';

interface ServiceStatusConfig {
  apiKey: string;
  baseUrl: string;
  isTesting: boolean;
  openAIApiKey: string;
  openAIBaseUrl: string;
  openAIEnabled: boolean;
  isTestingOpenAI: boolean;
  deepSeekApiKey: string;
  isTestingDeepSeek: boolean;
  lianchiApiKey: string;
  isTestingLianchi: boolean;
  wanbangKey: string;
  wanbangSecret: string;
  isTestingWanbang: boolean;
  scraperId: string;
  scraperSecret: string;
  isTestingScraper: boolean;
  qiyunAppId: string;
  qiyunAppKey: string;
  isTestingQiyun: boolean;
  storageEndpoint: string;
  storageProvider: string;
  storageAccountId: string;
  storageAccessKeyId: string;
  storageSecretAccessKey: string;
  storageBucketName: string;
  storageEnabled: boolean;
  isTestingStorage: boolean;
  connectionResults: Record<string, ConnectionTestRecord | undefined>;
}

export function serviceStatuses(config: ServiceStatusConfig) {
  const c = config;
  return Object.fromEntries([
    ['comfly_gateway', Boolean(c.apiKey.trim() && c.baseUrl.trim()), true, c.isTesting],
    ['openai_official', Boolean(c.openAIApiKey.trim() && c.openAIBaseUrl.trim()), c.openAIEnabled, c.isTestingOpenAI],
    ['deepseek_official', Boolean(c.deepSeekApiKey.trim()), true, c.isTestingDeepSeek],
    ['lianchi_images', Boolean(c.lianchiApiKey.trim()), true, c.isTestingLianchi],
    ['wanbang_ecommerce', Boolean(c.wanbangKey.trim() && c.wanbangSecret.trim()), true, c.isTestingWanbang],
    ['apia_parser', Boolean(c.scraperId.trim() && c.scraperSecret.trim()), true, c.isTestingScraper],
    ['qiyun_parser', Boolean(c.qiyunAppId.trim() && c.qiyunAppKey.trim()), true, c.isTestingQiyun],
    ['cloud_storage', Boolean((c.storageEndpoint.trim() || (c.storageProvider === 'r2' && c.storageAccountId.trim())) && c.storageAccessKeyId.trim() && c.storageSecretAccessKey.trim() && c.storageBucketName.trim()), c.storageEnabled, c.isTestingStorage],
  ].map(([id, configured, enabled, testing]) => [String(id), resolveServiceStatus(Boolean(configured), Boolean(enabled), Boolean(testing), c.connectionResults[String(id)])]));
}
