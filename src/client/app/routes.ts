import { lazy, type ComponentType } from 'react';
import { normalizeAppView, type AppView } from '@client/store/appView';

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

/** 声明式视图 ↔ URL 映射（轻量路由层，无需引入 TanStack Router） */
export const VIEW_URL_ALIASES: Record<string, AppView> = {
  hub: 'home',
  buyer_show: 'workshop',
};

export const VIEW_TO_URL: Record<AppView, string> = {
  home: 'home',
  generate: 'generate',
  workshop: 'workshop',
  headline_poster: 'headline_poster',
  keyword_review: 'keyword_review',
  assets: 'assets',
  asset_library: 'asset_library',
  canvas: 'canvas',
  settings: 'settings',
  skills: 'skills',
  video_sales: 'video_sales',
};

export function parseViewFromSearchParams(search: string): AppView {
  const params = new URLSearchParams(search);
  const raw = params.get('view') || 'home';
  const normalized = raw === 'asset_library' && params.get('tab') === 'canvas' ? 'assets' : VIEW_URL_ALIASES[raw] || raw;
  return normalizeAppView(normalized) ?? 'home';
}

export function parseAssetLibraryTab(search: string): 'canvas' | 'media' {
  return new URLSearchParams(search).get('tab') === 'canvas' ? 'canvas' : 'media';
}

export function buildViewSearchParams(view: AppView, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  // 首页就是站点根路径，不再拼 ?view=home
  if (view !== 'home') {
    params.set('view', VIEW_TO_URL[view] || view);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return params.toString();
}

export function syncViewToUrl(view: AppView, extra?: Record<string, string>) {
  if (typeof window === 'undefined') return;
  const next = buildViewSearchParams(view, extra);
  const current = window.location.search.replace(/^\?/, '');
  if (current === next) return;
  const url = next ? `${window.location.pathname}?${next}` : window.location.pathname || '/';
  window.history.replaceState(null, '', url);
}
