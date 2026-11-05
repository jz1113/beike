export type AppView = 'home' | 'generate' | 'workshop' | 'headline_poster' | 'keyword_review' | 'assets' | 'asset_library' | 'canvas' | 'settings' | 'skills' | 'video_sales';

const MOUNTED_VIEWS = ['home', 'generate', 'assets', 'asset_library', 'canvas', 'settings', 'skills'] as const;

const LEGACY_VIEW: Record<string, AppView> = {
  hub: 'home',
  buyer_show: 'home',
  home: 'home',
  generate: 'generate',
  workshop: 'home',
  headline_poster: 'home',
  keyword_review: 'home',
  assets: 'assets',
  asset_library: 'asset_library',
  canvas: 'canvas',
  settings: 'settings',
  skills: 'skills',
  ppt_generator: 'home',
  avatar: 'home',
  digital_human: 'home',
  video_sales: 'home',
  daihuo: 'home',
};

export function normalizeAppView(raw: string | null | undefined): AppView | null {
  if (!raw) return null;
  return LEGACY_VIEW[raw] ?? null;
}

export function isAppView(value: string): value is AppView {
  return (MOUNTED_VIEWS as readonly string[]).includes(value);
}
