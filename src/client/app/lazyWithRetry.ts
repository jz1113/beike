import { lazy, type ComponentType } from 'react';

/**
 * React.lazy 动态代码分割与自动容错重试机制
 * （模态框/抽屉按需加载，防无限循环刷新）
 */
export function lazyWithRetry<P = Record<string, unknown>>(
  factory: () => Promise<{ default: ComponentType<P> }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      console.warn('[Vite Lazy] Chunk import failed, retrying in 300ms...', err);
      await new Promise((r) => setTimeout(r, 300));
      try {
        return await factory();
      } catch (retryErr: unknown) {
        console.warn('[Vite Lazy] Second retry in 800ms...', retryErr);
        await new Promise((r) => setTimeout(r, 800));
        try {
          return await factory();
        } catch (finalErr) {
          if (typeof window !== 'undefined') {
            try {
              const lastReload = Number(sessionStorage.getItem('__vite_lazy_reload_ts') || '0');
              const now = Date.now();
              if (now - lastReload > 10000) {
                sessionStorage.setItem('__vite_lazy_reload_ts', String(now));
                window.location.reload();
              }
            } catch {
              /* ignore storage errors */
            }
          }
          throw finalErr;
        }
      }
    }
  });
}
