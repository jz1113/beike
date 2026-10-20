import {
  POSTER_PRODUCTION_SETTINGS_KEY,
  normalizeConcurrency,
  normalizeTitleHandling,
  type PosterProductionSettings,
} from './posterTypes';

export function normalizePosterProductionSettings(value: unknown): Partial<PosterProductionSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed = value as Partial<PosterProductionSettings>;
  return {
    imageModel: typeof parsed.imageModel === 'string' ? parsed.imageModel.trim() || undefined : undefined,
    titleModel: typeof parsed.titleModel === 'string' ? parsed.titleModel.trim() || undefined : undefined,
    titleHandling: normalizeTitleHandling(parsed.titleHandling),
    imageQuality: parsed.imageQuality === 'high' || parsed.imageQuality === 'medium' || parsed.imageQuality === 'low' ? parsed.imageQuality : undefined,
    concurrency: normalizeConcurrency(parsed.concurrency),
    memorySampleId: typeof parsed.memorySampleId === 'string' ? parsed.memorySampleId.trim().slice(0, 128) : '',
  };
}

export function loadPosterProductionSettings(): Partial<PosterProductionSettings> {
  try {
    const raw = window.localStorage.getItem(POSTER_PRODUCTION_SETTINGS_KEY);
    if (!raw) return {};
    return normalizePosterProductionSettings(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function persistPosterProductionSettings(next: PosterProductionSettings): boolean {
  try {
    window.localStorage.setItem(POSTER_PRODUCTION_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  // A failed compatibility write does not undo the successfully saved settings.
  try { window.localStorage.setItem('ai_image_gen_model', next.imageModel); } catch { /* optional compatibility setting */ }
  return true;
}
