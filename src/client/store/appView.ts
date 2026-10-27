export type AppView = 'home' | 'generate' | 'workshop' | 'headline_poster' | 'keyword_review' | 'assets' | 'canvas' | 'settings' | 'skills' | 'video_sales';

const LEGACY_VIEW: Record<string, AppView> = {
  hub: 'home',
  buyer_show: 'workshop',
  home: 'home',
  generate: 'generate',
  workshop: 'workshop',
  headline_poster: 'headline_poster',
  keyword_review: 'keyword_review',
  assets: 'assets',
  canvas: 'canvas',
  settings: 'settings',
  skills: 'skills',
  ppt_generator: 'home',
  avatar: 'home',
  digital_human: 'home',
  video_sales: 'video_sales',
  daihuo: 'video_sales',
};

export function normalizeAppView(raw: string | null | undefined): AppView | null {
  if (!raw) return null;
  return LEGACY_VIEW[raw] ?? null;
}

export function isAppView(value: string): value is AppView {
  return (
    value === 'home' ||
    value === 'generate' ||
    value === 'workshop' ||
    value === 'headline_poster' ||
    value === 'keyword_review' ||
    value === 'assets' ||
    value === 'canvas' ||
    value === 'settings' ||
    value === 'skills' ||
    value === 'video_sales'
  );
}
