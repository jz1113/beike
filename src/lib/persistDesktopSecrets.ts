import { invoke } from '@tauri-apps/api/core';
import { apiFetch } from '@/lib/apiClient';
import { credentialSet, type CredentialKey } from '@/lib/credentialClient';
import { isTauriDesktop } from '@/lib/desktopRuntime';
import type { StorageConfig } from '@/lib/storageClient';

export type DesktopEnvPayload = {
  baseUrl?: string;
  apiKey?: string;
  wanbangKey?: string;
  wanbangSecret?: string;
  externalScraperId?: string;
  externalScraperSecret?: string;
  storage?: Partial<StorageConfig> & { enabled?: boolean };
};

async function postDesktopEnv(payload: DesktopEnvPayload): Promise<void> {
  if (isTauriDesktop()) {
    try {
      await invoke('save_desktop_env', {
        baseUrl: payload.baseUrl?.trim() || null,
        apiKey: payload.apiKey?.trim() || null,
      });
    } catch {
      /* fallback HTTP */
    }
  }

  await apiFetch('/api/system/desktop-env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export async function persistAiGatewayConfig(baseUrl: string, apiKey: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ai_base_url', baseUrl.trim());
    localStorage.removeItem('ai_api_key');
  }
  if (apiKey.trim()) {
    await credentialSet('ai_api_key', apiKey.trim());
  }
  await postDesktopEnv({ baseUrl, apiKey });
}

export async function persistWanbangConfig(key: string, secret: string): Promise<void> {
  if (key.trim()) await credentialSet('wanbang_api_key', key.trim());
  if (secret.trim()) await credentialSet('wanbang_api_secret', secret.trim());
  if (typeof window !== 'undefined') {
    localStorage.removeItem('wanbang_api_key');
    localStorage.removeItem('wanbang_api_secret');
  }
  await postDesktopEnv({ wanbangKey: key, wanbangSecret: secret });
}

export async function persistExternalScraperConfig(id: string, secret: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('external_scraper_id', id.trim());
    localStorage.removeItem('external_scraper_secret');
  }
  if (secret.trim()) await credentialSet('external_scraper_secret', secret.trim());
  await postDesktopEnv({ externalScraperId: id, externalScraperSecret: secret });
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
    localStorage.removeItem('storage_secret_access_key');
    localStorage.setItem('storage_bucket_name', config.bucketName);
    localStorage.setItem('storage_public_domain', config.publicDomain);
  }
  if (config.secretAccessKey.trim()) {
    await credentialSet('storage_secret_access_key', config.secretAccessKey.trim());
  }
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
  if (value.trim()) await credentialSet(key, value.trim());
}
