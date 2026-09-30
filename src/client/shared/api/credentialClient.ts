import { writeLocalConfig } from './localConfigStorage';

export type CredentialKey =
  | 'ai_api_key'
  | 'deepseek_api_key'
  | 'openai_api_key'
  | 'lianchi_api_key'
  | 'image_api_key'
  | 'wanbang_api_key'
  | 'wanbang_api_secret'
  | 'social_parse_secret'
  | 'external_scraper_id'
  | 'external_scraper_secret'
  | 'qiyun_app_id'
  | 'qiyun_app_key'
  | 'storage_secret_access_key'
  | 'gateway_system_token';

const LEGACY_LOCAL_KEYS: Record<CredentialKey, string> = {
  ai_api_key: 'ai_api_key',
  deepseek_api_key: 'deepseek_api_key',
  openai_api_key: 'openai_api_key',
  lianchi_api_key: 'lianchi_api_key',
  image_api_key: 'image_api_key',
  wanbang_api_key: 'wanbang_api_key',
  wanbang_api_secret: 'wanbang_api_secret',
  social_parse_secret: 'social_parse_secret',
  external_scraper_id: 'external_scraper_id',
  external_scraper_secret: 'external_scraper_secret',
  qiyun_app_id: 'qiyun_app_id',
  qiyun_app_key: 'qiyun_app_key',
  storage_secret_access_key: 'storage_secret_access_key',
  gateway_system_token: 'gateway_system_token',
};

const credentialMemoryCache = new Map<CredentialKey, string>();

/** 供测试或特殊场景重置内存缓存 */
export function clearCredentialMemoryCache(): void {
  credentialMemoryCache.clear();
}

function readLocal(key: CredentialKey): string {
  try {
    return localStorage.getItem(LEGACY_LOCAL_KEYS[key]) || '';
  } catch {
    throw new Error('本地凭据读取失败，请检查存储权限后重试');
  }
}

export async function credentialSetBatch(
  entries: ReadonlyArray<readonly [CredentialKey, string]>,
  metadata: Readonly<Record<string, string | null>> = {},
): Promise<void> {
  const normalized = entries.map(([key, value]) => [key, value.trim()] as const);
  const values: Record<string, string | null> = { ...metadata };
  for (const [key, value] of normalized) values[LEGACY_LOCAL_KEYS[key]] = value || null;
  try { writeLocalConfig(values); }
  catch (error) {
    for (const [key] of normalized) credentialMemoryCache.delete(key);
    throw error;
  }
  for (const [key, value] of normalized) credentialMemoryCache.set(key, value);
}

export async function credentialSet(key: CredentialKey, value: string): Promise<void> {
  await credentialSetBatch([[key, value]]);
}

export async function credentialGet(key: CredentialKey, refresh = false): Promise<string> {
  if (!refresh && credentialMemoryCache.has(key)) {
    return credentialMemoryCache.get(key) || '';
  }

  // The browser store is synchronous; failed reads must not leave a permanent request cache.
  const finalVal = readLocal(key);
  credentialMemoryCache.set(key, finalVal);
  return finalVal;
}

export async function credentialDelete(key: CredentialKey): Promise<void> {
  await credentialSetBatch([[key, '']]);
}

export async function credentialHas(key: CredentialKey): Promise<boolean> {
  if (credentialMemoryCache.has(key)) {
    return Boolean(credentialMemoryCache.get(key)?.trim());
  }
  return Boolean(readLocal(key).trim());
}

/** Web 模式无 Keychain 可迁，保留空实现以免改动启动调用点 */
export async function migrateLegacyCredentialsOnce(): Promise<void> {}
