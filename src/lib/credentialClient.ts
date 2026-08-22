import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from '@/lib/desktopRuntime';

export type CredentialKey =
  | 'ai_api_key'
  | 'wanbang_api_secret'
  | 'social_parse_secret'
  | 'storage_secret_access_key';

const LEGACY_LOCAL_KEYS: Record<CredentialKey, string> = {
  ai_api_key: 'ai_api_key',
  wanbang_api_secret: 'wanbang_api_secret',
  social_parse_secret: 'social_parse_secret',
  storage_secret_access_key: 'storage_secret_access_key',
};

export async function credentialSet(key: CredentialKey, value: string): Promise<void> {
  if (!isTauriDesktop()) {
    try {
      localStorage.setItem(LEGACY_LOCAL_KEYS[key], value);
    } catch {
      /* ignore */
    }
    return;
  }
  await invoke('credential_set', { key, value });
}

export async function credentialDelete(key: CredentialKey): Promise<void> {
  if (!isTauriDesktop()) {
    try {
      localStorage.removeItem(LEGACY_LOCAL_KEYS[key]);
    } catch {
      /* ignore */
    }
    return;
  }
  await invoke('credential_delete', { key });
}

export async function credentialHas(key: CredentialKey): Promise<boolean> {
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
