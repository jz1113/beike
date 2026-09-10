
import { useState, useEffect } from 'react';

export const XL_QUERY = '(min-width: 1280px)';
export const LG_QUERY = '(min-width: 1024px)';
export const MD_QUERY = '(min-width: 768px)';
export const SM_QUERY = '(min-width: 640px)';

export type ViewportDensity = 'sm' | 'md' | 'lg' | 'xl';

export const UI_SCALE_OVERRIDE_KEY = 'ui_scale_override';

const DENSITY_SCALE: Record<ViewportDensity, number> = {
  xl: 1,
  lg: 0.96,
  md: 0.91,
  sm: 0.86,
};

export function getUiScaleOverride(): number {
  if (typeof window === 'undefined') return 1;
  const raw = localStorage.getItem(UI_SCALE_OVERRIDE_KEY);
  const parsed = raw ? parseFloat(raw) : 1;
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(1.2, Math.max(0.8, parsed));
}

export function getViewportDensity(): ViewportDensity {
  if (typeof window === 'undefined') return 'xl';
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 1440 && h >= 880) return 'xl';
  if (w >= 1200 && h >= 780) return 'lg';
  if (w >= 960 && h >= 680) return 'md';
  return 'sm';
}

export function applyViewportDensity(density: ViewportDensity) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', density);
  const override = getUiScaleOverride();
  const final = Number((DENSITY_SCALE[density] * override).toFixed(3));
  document.documentElement.style.setProperty('--ui-density', String(final));
}

export function setUiScaleOverride(scale: number) {
  if (typeof window === 'undefined') return;
  const clamped = Math.min(1.2, Math.max(0.8, scale));
  localStorage.setItem(UI_SCALE_OVERRIDE_KEY, String(clamped));
  applyViewportDensity(getViewportDensity());
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useViewportDensity(): ViewportDensity {
  const [density, setDensity] = useState<ViewportDensity>(() => getViewportDensity());

  useEffect(() => {
    const update = () => {
      const next = getViewportDensity();
      setDensity(next);
      applyViewportDensity(next);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return density;
}
