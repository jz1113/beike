import { normalizeAppView, type AppView } from '@client/store/appView';
import { normalizeWorkshopTab } from '@client/store/workshopTab';

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
  canvas: 'canvas',
  settings: 'settings',
};

export function parseViewFromSearchParams(search: string): AppView {
  const params = new URLSearchParams(search);
  const raw = params.get('view') || 'home';
  const normalized = VIEW_URL_ALIASES[raw] || raw;
  return normalizeAppView(normalized) ?? 'home';
}

export function parseWorkshopTabFromSearchParams(search: string) {
  return normalizeWorkshopTab(new URLSearchParams(search).get('tab'));
}

export function buildViewSearchParams(view: AppView, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  // 首页就是站点根路径，不再拼 ?view=home
  if (view !== 'home') {
    params.set('view', VIEW_TO_URL[view] || view);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, view === 'workshop' && k === 'tab' ? normalizeWorkshopTab(v) : v);
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

/**
 * TanStack Router 评估结论（Phase 4）：
 * - 当前 4 个顶栏视图 + 工坊 step 深链，用 `routes.ts` + `viewSlice` 已足够。
 * - 若未来需要嵌套路由（资产中心多 tab、工坊 5 步独立 URL），再引入 TanStack Router。
 */
