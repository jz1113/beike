export type CredentialKey =
  | 'ai_api_key'
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
const inflightGetRequests = new Map<CredentialKey, Promise<string>>();

/** 供测试或特殊场景重置内存缓存 */
export function clearCredentialMemoryCache(): void {
  credentialMemoryCache.clear();
  inflightGetRequests.clear();
}

function readLocal(key: CredentialKey): string {
  try {
    return localStorage.getItem(LEGACY_LOCAL_KEYS[key]) || '';
  } catch {
    return '';
  }
}

function writeLocal(key: CredentialKey, value: string): void {
  try {
    if (value) localStorage.setItem(LEGACY_LOCAL_KEYS[key], value);
    else localStorage.removeItem(LEGACY_LOCAL_KEYS[key]);
  } catch {
    /* ignore */
  }
}

export async function credentialSet(key: CredentialKey, value: string): Promise<void> {
  const trimmed = value.trim();
  writeLocal(key, trimmed);
  credentialMemoryCache.set(key, trimmed);
}

export async function credentialGet(key: CredentialKey): Promise<string> {
  if (credentialMemoryCache.has(key)) {
    return credentialMemoryCache.get(key) || '';
  }

  if (inflightGetRequests.has(key)) {
    return inflightGetRequests.get(key)!;
  }

  const fetchPromise = (async () => {
    const finalVal = readLocal(key);
    credentialMemoryCache.set(key, finalVal);
    inflightGetRequests.delete(key);
    return finalVal;
  })();

  inflightGetRequests.set(key, fetchPromise);
  return fetchPromise;
}

export async function credentialDelete(key: CredentialKey): Promise<void> {
  credentialMemoryCache.set(key, '');
  writeLocal(key, '');
}

export async function credentialHas(key: CredentialKey): Promise<boolean> {
  if (credentialMemoryCache.has(key)) {
    return Boolean(credentialMemoryCache.get(key)?.trim());
  }
  return Boolean(readLocal(key).trim());
}

/** Web 模式无 Keychain 可迁，保留空实现以免改动启动调用点 */
export async function migrateLegacyCredentialsOnce(): Promise<void> {}
