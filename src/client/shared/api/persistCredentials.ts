import { credentialSet, credentialDelete, type CredentialKey } from '@client/shared/api/credentialClient';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@client/shared/api/gatewayClient';

export interface StorageConfig {
  enabled?: boolean;
  provider?: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  accountId?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicDomain?: string;
  region?: string;
}

class CredentialPersistError extends Error {
  constructor(public readonly key: CredentialKey, cause: unknown) {
    super(`凭证 ${key} 写入失败: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CredentialPersistError';
  }
}

async function persistCredentialStrict(key: CredentialKey, value: string): Promise<void> {
  try {
    if (value.trim()) {
      await credentialSet(key, value.trim());
    } else {
      await credentialDelete(key);
    }
  } catch (e) {
    throw new CredentialPersistError(key, e);
  }
}

export async function persistAiGatewayConfig(baseUrl: string, apiKey: string): Promise<void> {
  const cleanUrl = baseUrl.trim();
  const cleanKey = apiKey.trim();
  await persistCredentialStrict('ai_api_key', cleanKey);
  setClientGatewayBaseUrl(cleanUrl);
  setClientGatewayApiKey(cleanKey);
  if (typeof window !== 'undefined') {
    localStorage.setItem('ai_base_url', cleanUrl);
  }
}

/** 保存 DeepSeek 官方密钥；只有用户明确启用时才会替换当前主接口。 */
export async function persistDeepSeekConfig(apiKey: string): Promise<void> {
  await persistCredentialStrict('deepseek_api_key', apiKey.trim());
}

/** OpenAI Responses 凭证独立于 Comfly 主网关。 */
export async function persistOpenAIConfig(baseUrl: string, apiKey: string): Promise<void> {
  await persistCredentialStrict('openai_api_key', apiKey.trim());
  localStorage.setItem('openai_base_url', baseUrl.trim().replace(/\/+$/, '') || 'https://api.openai.com');
}

export async function persistLianchiConfig(apiKey: string): Promise<void> {
  await persistCredentialStrict('lianchi_api_key', apiKey.trim());
}

export async function persistWanbangConfig(key: string, secret: string): Promise<void> {
  await persistCredentialStrict('wanbang_api_key', key.trim());
  await persistCredentialStrict('wanbang_api_secret', secret.trim());
}

export async function persistExternalScraperConfig(id: string, secret: string): Promise<void> {
  await persistCredentialStrict('external_scraper_id', id.trim());
  await persistCredentialStrict('external_scraper_secret', secret.trim());
}

export async function persistQiyunConfig(appId: string, appKey: string): Promise<void> {
  await persistCredentialStrict('qiyun_app_id', appId.trim());
  await persistCredentialStrict('qiyun_app_key', appKey.trim());
}

export async function persistStorageConfig(config: {
  enabled: boolean;
  provider: StorageConfig['provider'];
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('storage_enabled', String(config.enabled));
    localStorage.setItem('storage_provider', config.provider || 'r2');
    localStorage.setItem('storage_account_id', config.accountId);
    localStorage.setItem('storage_endpoint', config.endpoint);
    localStorage.setItem('storage_access_key_id', config.accessKeyId);
    localStorage.setItem('storage_bucket_name', config.bucketName);
    localStorage.setItem('storage_public_domain', config.publicDomain);
  }
  await persistCredentialStrict('storage_secret_access_key', config.secretAccessKey);
}
