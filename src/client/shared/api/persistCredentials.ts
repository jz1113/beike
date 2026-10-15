import { credentialSetBatch, type CredentialKey } from '@client/shared/api/credentialClient';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@client/shared/api/gatewayClient';

export interface StorageConfig {
  enabled?: boolean;
  provider?: 'oss' | 'qiniu' | 'cloudinary' | 'cos' | 'r2' | 's3' | 'minio' | 'supabase';
  accountId?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicDomain?: string;
  region?: string;
  apiPrefix?: string;
  materialsPrefix?: string;
  cloudName?: string;
  zone?: string;
}

class CredentialPersistError extends Error {
  constructor(public readonly key: CredentialKey, cause: unknown) {
    super(`凭证 ${key} 写入失败: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CredentialPersistError';
  }
}

let saveQueue = Promise.resolve();

/** Browser settings stay local; each credential group commits together in invocation order. */
function persistLocalConfig(
  credentials: ReadonlyArray<readonly [CredentialKey, string]>,
  metadata: Readonly<Record<string, string | null>> = {},
  onSaved?: () => void,
): Promise<void> {
  const pending = saveQueue.then(async () => {
    await credentialSetBatch(credentials, metadata);
    onSaved?.();
  });
  saveQueue = pending.catch(() => {});
  return pending;
}

export async function waitForCredentialSaves(): Promise<void> {
  while (true) {
    const pending = saveQueue;
    await pending;
    if (pending === saveQueue) return;
  }
}

export function persistAiGatewayConfig(baseUrl: string, apiKey: string): Promise<void> {
  const cleanUrl = baseUrl.trim();
  const cleanKey = apiKey.trim();
  let url: URL;
  try { url = new URL(cleanUrl); } catch { return Promise.reject(new Error('请填写完整的 HTTP 或 HTTPS 接口地址')); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    return Promise.reject(new Error('接口地址须为 HTTP 或 HTTPS Base URL，不包含账号、查询参数或片段'));
  }
  return persistLocalConfig([['ai_api_key', cleanKey]], { ai_base_url: cleanUrl }, () => {
    setClientGatewayBaseUrl(cleanUrl);
    setClientGatewayApiKey(cleanKey);
  });
}

/** DeepSeek credentials never replace the Comfly route. */
export function persistDeepSeekConfig(apiKey: string): Promise<void> {
  return persistLocalConfig([['deepseek_api_key', apiKey.trim()]]);
}

export function persistOpenAIConfig(baseUrl: string, apiKey: string, options?: {
  enabled: boolean;
  allowInsecureHttp: boolean;
}): Promise<void> {
  const cleanUrl = baseUrl.trim().replace(/\/+$/, '') || 'https://api.openai.com';
  const metadata: Record<string, string | null> = { openai_base_url: cleanUrl };
  if (options) {
    metadata.openai_responses_enabled = String(options.enabled);
    metadata.openai_channel_split_v1 = 'true';
    metadata.openai_insecure_http_consent_url = options.allowInsecureHttp ? cleanUrl : null;
  }
  return persistLocalConfig([['openai_api_key', apiKey.trim()]], metadata);
}

export function persistLianchiConfig(apiKey: string): Promise<void> {
  return persistLocalConfig([['lianchi_api_key', apiKey.trim()]]);
}

export function persistWanbangConfig(key: string, secret: string, enabled?: boolean): Promise<void> {
  return persistLocalConfig([['wanbang_api_key', key.trim()], ['wanbang_api_secret', secret.trim()]],
    enabled === undefined ? {} : { wanbang_enabled: String(enabled) });
}

export function persistExternalScraperConfig(id: string, secret: string, enabled?: boolean): Promise<void> {
  return persistLocalConfig([['external_scraper_id', id.trim()], ['external_scraper_secret', secret.trim()]],
    enabled === undefined ? {} : { apia_enabled: String(enabled) });
}

export function persistQiyunConfig(appId: string, appKey: string, enabled?: boolean): Promise<void> {
  return persistLocalConfig([['qiyun_app_id', appId.trim()], ['qiyun_app_key', appKey.trim()]],
    enabled === undefined ? {} : { qiyun_enabled: String(enabled) });
}

export function persistStorageConfig(config: {
  enabled: boolean;
  provider: StorageConfig['provider'];
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
  apiPrefix?: string;
  materialsPrefix?: string;
  cloudName?: string;
  zone?: string;
}): Promise<void> {
  return persistLocalConfig([['storage_secret_access_key', config.secretAccessKey.trim()]], {
    storage_enabled: String(config.enabled),
    storage_provider: config.provider || 'oss',
    storage_account_id: config.accountId.trim(),
    storage_endpoint: config.endpoint.trim(),
    storage_access_key_id: config.accessKeyId.trim(),
    storage_bucket_name: config.bucketName.trim(),
    storage_public_domain: config.publicDomain.trim(),
    storage_api_prefix: (config.apiPrefix || 'seedance/').trim(),
    storage_materials_prefix: (config.materialsPrefix || 'canvas-materials/').trim(),
    storage_cloud_name: (config.cloudName || '').trim(),
    storage_zone: (config.zone || 'z2').trim(),
  });
}

export async function persistCredentialOnly(key: CredentialKey, value: string): Promise<void> {
  try { await persistLocalConfig([[key, value.trim()]]); }
  catch (error) { throw new CredentialPersistError(key, error); }
}

export { CredentialPersistError };
