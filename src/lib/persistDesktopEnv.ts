import { invoke } from '@tauri-apps/api/core';
import { apiFetch } from '@/lib/apiClient';
import { isTauriDesktop } from '@/lib/desktopRuntime';

/** 桌面端：将 API 网关配置写入 localStorage + sidecar .env */
export async function persistDesktopApiConfig(baseUrl: string, apiKey: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ai_base_url', baseUrl);
    localStorage.setItem('ai_api_key', apiKey);
  }

  if (isTauriDesktop()) {
    try {
      await invoke('save_desktop_env', {
        baseUrl: baseUrl.trim() || null,
        apiKey: apiKey.trim() || null,
      });
    } catch {
      /* fallback HTTP */
    }
    try {
      await apiFetch('/api/system/desktop-env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
    } catch {
      /* sidecar 尚未就绪时忽略 */
    }
    return;
  }

  await apiFetch('/api/system/desktop-env', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey }),
  }).catch(() => {});
}
