export type AppView = 'home' | 'generate' | 'workshop' | 'headline_poster' | 'assets' | 'canvas' | 'settings';

const LEGACY_VIEW: Record<string, AppView> = {
  hub: 'home',
  buyer_show: 'workshop',
  home: 'home',
  generate: 'generate',
  workshop: 'workshop',
  headline_poster: 'headline_poster',
  assets: 'assets',
  canvas: 'canvas',
  settings: 'settings',
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
    value === 'assets' ||
    value === 'canvas' ||
    value === 'settings'
  );
}
