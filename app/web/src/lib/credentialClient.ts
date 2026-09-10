import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from '@/lib/desktopRuntime';

export type CredentialKey =
  | 'ai_api_key'
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

// 🌟 运行期内存缓存：单次桌面应用运行期间，凭证仅向系统钥匙串读取一次，彻底避免重复弹出系统密码框
const credentialMemoryCache = new Map<CredentialKey, string>();
const inflightGetRequests = new Map<CredentialKey, Promise<string>>();

/** 供测试或特殊场景重置内存缓存 */
export function clearCredentialMemoryCache(): void {
  credentialMemoryCache.clear();
  inflightGetRequests.clear();
}

export async function credentialSet(key: CredentialKey, value: string): Promise<void> {
  const trimmed = value.trim();

  // 1. 桌面端优先使用系统钥匙串 / 本地安全凭证（失败直接向外抛出以符合安全审计）
  if (isTauriDesktop()) {
    await invoke('credential_set', { key, value: trimmed });
    credentialMemoryCache.set(key, trimmed);
    // 网关系统访问令牌作为系统级连接凭据，额外保留本地镜像以支持纯前端极速初始化
    if (key === 'gateway_system_token') {
      try {
        if (trimmed) localStorage.setItem(LEGACY_LOCAL_KEYS[key], trimmed);
        else localStorage.removeItem(LEGACY_LOCAL_KEYS[key]);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  // 2. 浏览器 / Web 模式：使用 localStorage 进行持久化
  try {
    if (trimmed) {
      localStorage.setItem(LEGACY_LOCAL_KEYS[key], trimmed);
    } else {
      localStorage.removeItem(LEGACY_LOCAL_KEYS[key]);
    }
    credentialMemoryCache.set(key, trimmed);
  } catch {
    /* ignore */
  }
}

export async function credentialGet(key: CredentialKey): Promise<string> {
  // 1. 优先命中内存缓存：瞬间返回，零 IPC 开销，绝对不触碰系统钥匙串
  if (credentialMemoryCache.has(key)) {
    return credentialMemoryCache.get(key) || '';
  }

  // 2. 并发合并：若多个组件在同一瞬间读取同一个 key，复用同一个底层 Promise
  if (inflightGetRequests.has(key)) {
    return inflightGetRequests.get(key)!;
  }

  const fetchPromise = (async () => {
    try {
      let desktopVal: string | null = null;
      if (isTauriDesktop()) {
        try {
          desktopVal = await invoke<string | null>('credential_get', { key });
        } catch (err) {
          console.warn(`[credentialGet] 桌面端 credential_get 告警:`, err);
        }
      }

      const localVal = localStorage.getItem(LEGACY_LOCAL_KEYS[key]) || '';
      const finalVal =
        desktopVal && typeof desktopVal === 'string' && desktopVal.trim()
          ? desktopVal.trim()
          : localVal;

      credentialMemoryCache.set(key, finalVal);

      // 如果桌面端无值但本地存储有值，自动向桌面端安全回写持久化
      if (isTauriDesktop() && !desktopVal && finalVal) {
        invoke('credential_set', { key, value: finalVal }).catch(() => {});
      }

      return finalVal;
    } catch {
      const fallback = localStorage.getItem(LEGACY_LOCAL_KEYS[key]) || '';
      credentialMemoryCache.set(key, fallback);
      return fallback;
    } finally {
      inflightGetRequests.delete(key);
    }
  })();

  inflightGetRequests.set(key, fetchPromise);
  return fetchPromise;
}

export async function credentialDelete(key: CredentialKey): Promise<void> {
  if (isTauriDesktop()) await invoke('credential_delete', { key });
  credentialMemoryCache.set(key, '');
  try { localStorage.removeItem(LEGACY_LOCAL_KEYS[key]); } catch { /* storage disabled */ }
}

export async function credentialHas(key: CredentialKey): Promise<boolean> {
  if (credentialMemoryCache.has(key)) {
    return Boolean(credentialMemoryCache.get(key)?.trim());
  }

  if (!isTauriDesktop()) {
    try {
      const v = localStorage.getItem(LEGACY_LOCAL_KEYS[key]);
      return Boolean(v && v.trim());
    } catch {
      return false;
    }
  }
  return invoke<boolean>('credential_has', { key });
}

/** 启动时将 localStorage 中的 secret 一次性迁入系统 Keychain */
export async function migrateLegacyCredentialsOnce(): Promise<void> {
  if (!isTauriDesktop() || typeof window === 'undefined') return;
  const flag = 'credential_migrated_v1';
  if (localStorage.getItem(flag) === '1') return;

  let migrated = false;
  for (const [credKey, storageKey] of Object.entries(LEGACY_LOCAL_KEYS)) {
    try {
      const legacy = localStorage.getItem(storageKey);
      if (!legacy?.trim()) continue;
      const has = await credentialHas(credKey as CredentialKey);
      if (!has) {
        await credentialSet(credKey as CredentialKey, legacy.trim());
      }
      localStorage.removeItem(storageKey);
      migrated = true;
    } catch {
      /* 保留 localStorage，下次再试 */
    }
  }

  if (migrated) {
    localStorage.setItem(flag, '1');
  }
}
