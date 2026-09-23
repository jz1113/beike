import { apiFetch } from '@/shared/api/apiClient';
import { credentialSet, credentialDelete, type CredentialKey } from '@/shared/api/credentialClient';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@/shared/api/gatewayClient';
import { isTauriDesktop } from '@/shared/desktop/desktopRuntime';

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

export type DesktopEnvPayload = {
  baseUrl?: string;
  apiKey?: string;
  wanbangKey?: string;
  wanbangSecret?: string;
  externalScraperId?: string;
  externalScraperSecret?: string;
  storage?: Partial<StorageConfig> & { enabled?: boolean };
  cacheDir?: string;
  qiyunAppId?: string;
  qiyunAppKey?: string;
};

/**
 * Web 模式：敏感凭证写入 localStorage，并由 HTTP `/api/system/desktop-env` 同步到本机服务。
 */

class CredentialPersistError extends Error {
  constructor(public readonly key: CredentialKey, cause: unknown) {
    super(`凭证 ${key} 写入 Keychain 失败: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CredentialPersistError';
  }
}

/** 通过 HTTP 写入服务端 .env 并热更新 sidecar process.env */
async function postDesktopEnv(payload: DesktopEnvPayload): Promise<void> {
  // 公网 Web 多人共用一台服务器：密钥只留在当前浏览器，经请求头发给当次接口。
  if (!isTauriDesktop() && import.meta.env.PROD) return;
  const res = await apiFetch('/api/system/desktop-env', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('配置保存后未能应用到当前服务，请重试');
}

/**
 * 写入 Keychain 中的单个凭证；失败时抛出 CredentialPersistError
 * 以便调用方显式提示用户并**禁止**降级到 localStorage。
 */
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

  // 3. 写入系统 Keychain（若失败捕获异常，确保后序 .env 与 sidecar 进程更新不被打断）
  let credErr: unknown = null;
  try {
    await persistCredentialStrict('ai_api_key', cleanKey);
  } catch (e) {
    credErr = e;
    console.warn('[persistAiGatewayConfig] Keychain 存储告警:', e);
  }

  // 4. 写入桌面端 .env（Rust 独占写文件）并通知 sidecar 进程热更新环境变量
  try {
    await postDesktopEnv({ baseUrl: cleanUrl, apiKey: cleanKey });
  } catch (e) {
    if (!credErr) throw e;
  }

  // 若 Keychain 报错，仍向上抛出以满足严格凭证测试规范
  if (credErr) {
    throw credErr;
  }
  // 持久化与应用成功后更新前端缓存
  setClientGatewayBaseUrl(cleanUrl);
  setClientGatewayApiKey(cleanKey);

  // 2. baseUrl 保留在 localStorage 方便 UI 记忆
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
  const cleanKey = key.trim();
  const cleanSecret = secret.trim();
  let credErr: unknown = null;
  try {
    await persistCredentialStrict('wanbang_api_key', cleanKey);
    await persistCredentialStrict('wanbang_api_secret', cleanSecret);
  } catch (e) {
    credErr = e;
  }
  try {
    await postDesktopEnv({ wanbangKey: cleanKey, wanbangSecret: cleanSecret });
  } catch (e) { if (!credErr) throw e; }
  if (credErr) throw credErr;
}

export async function persistExternalScraperConfig(id: string, secret: string): Promise<void> {
  const cleanId = id.trim();
  const cleanSecret = secret.trim();
  let credErr: unknown = null;
  try {
    await persistCredentialStrict('external_scraper_id', cleanId);
    await persistCredentialStrict('external_scraper_secret', cleanSecret);
  } catch (e) {
    credErr = e;
  }
  try {
    await postDesktopEnv({ externalScraperId: cleanId, externalScraperSecret: cleanSecret });
  } catch (e) { if (!credErr) throw e; }
  if (credErr) throw credErr;
}

export async function persistQiyunConfig(appId: string, appKey: string): Promise<void> {
  const cleanId = appId.trim();
  const cleanKey = appKey.trim();
  let credErr: unknown = null;
  try {
    await persistCredentialStrict('qiyun_app_id', cleanId);
    await persistCredentialStrict('qiyun_app_key', cleanKey);
  } catch (e) {
    credErr = e;
  }
  try {
    await postDesktopEnv({ qiyunAppId: cleanId, qiyunAppKey: cleanKey });
  } catch (e) { if (!credErr) throw e; }
  if (credErr) throw credErr;
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
  // 存储的非敏感配置（bucket、域名等）允许 localStorage；secretAccessKey 严禁
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
  await postDesktopEnv({
    storage: {
      enabled: config.enabled,
      provider: config.provider,
      accountId: config.accountId,
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucketName: config.bucketName,
      publicDomain: config.publicDomain,
    },
  });
}

export async function persistCredentialOnly(key: CredentialKey, value: string): Promise<void> {
  await persistCredentialStrict(key, value);
}

export { CredentialPersistError };
