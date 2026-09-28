import {
  POSTER_PRODUCTION_SETTINGS_KEY,
  normalizeConcurrency,
  normalizeTitleHandling,
  type PosterProductionSettings,
} from './posterTypes';

export function loadPosterProductionSettings(): Partial<PosterProductionSettings> {
  try {
    const raw = window.localStorage.getItem(POSTER_PRODUCTION_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PosterProductionSettings>;
    return {
      imageModel: typeof parsed.imageModel === 'string' ? parsed.imageModel : undefined,
      titleModel: typeof parsed.titleModel === 'string' ? parsed.titleModel : undefined,
      titleHandling: normalizeTitleHandling(parsed.titleHandling),
      imageQuality: parsed.imageQuality === 'high' || parsed.imageQuality === 'medium' || parsed.imageQuality === 'low' ? parsed.imageQuality : undefined,
      concurrency: normalizeConcurrency(parsed.concurrency),
    };
  } catch {
    return {};
  }
}

export function persistPosterProductionSettings(next: PosterProductionSettings): boolean {
  try {
    window.localStorage.setItem(POSTER_PRODUCTION_SETTINGS_KEY, JSON.stringify(next));
    window.localStorage.setItem('ai_image_gen_model', next.imageModel);
    return true;
  } catch {
    return false;
  }
}
