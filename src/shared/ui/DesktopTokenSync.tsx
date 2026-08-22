'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { setClientAccessToken } from '@/lib/apiClient';
import { isTauriDesktop, setApiBase } from '@/lib/desktopRuntime';
import { invoke } from '@tauri-apps/api/core';

/** 桌面生产壳把 LOCAL_ACCESS_TOKEN 同步后再渲染，避免首屏 API 仍用开发口令 */
export default function DesktopTokenSync({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (isTauriDesktop()) {
        try {
          const base = await invoke<string>('get_api_base');
          if (base) setApiBase(base);
        } catch {
          /* sidecar 尚未就绪 */
        }
      }

      const healthUrl = isTauriDesktop()
        ? `${(await invoke<string>('get_api_base').catch(() => '')) || ''}/api/health`
        : '/api/health';

      fetch(healthUrl.startsWith('http') ? healthUrl : '/api/health')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return;
          const token = typeof data?.desktopToken === 'string' ? data.desktopToken.trim() : '';
          if (token) setClientAccessToken(token);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
