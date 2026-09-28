export interface KeywordReviewSettings {
  /** Number of rows included in the initial trial run. */
  trialSize: number;
  /** Number of keyword rows sent in one model request. */
  batchSize: number;
  /** Adaptive request concurrency ceiling. */
  maxConcurrency: number;
}

export const KEYWORD_REVIEW_SETTINGS_STORAGE_KEY = 'keyword_review_execution_settings';
export const KEYWORD_REVIEW_TRIAL_SIZE_OPTIONS = [10, 20, 30, 50] as const;
export const KEYWORD_REVIEW_BATCH_SIZE_OPTIONS = [10, 20, 30, 50, 60] as const;
export const KEYWORD_REVIEW_CONCURRENCY_OPTIONS = [1, 2, 4, 6, 8, 12] as const;

export const DEFAULT_KEYWORD_REVIEW_SETTINGS: KeywordReviewSettings = {
  trialSize: 50,
  batchSize: 50,
  maxConcurrency: 12,
};

function chooseOption(value: unknown, options: readonly number[], fallback: number): number {
  const numeric = Number(value);
  return options.includes(numeric) ? numeric : fallback;
}

export function normalizeKeywordReviewSettings(value: unknown): KeywordReviewSettings {
  const settings = value && typeof value === 'object' ? value as Partial<KeywordReviewSettings> : {};
  return {
    trialSize: chooseOption(settings.trialSize, KEYWORD_REVIEW_TRIAL_SIZE_OPTIONS, DEFAULT_KEYWORD_REVIEW_SETTINGS.trialSize),
    batchSize: chooseOption(settings.batchSize, KEYWORD_REVIEW_BATCH_SIZE_OPTIONS, DEFAULT_KEYWORD_REVIEW_SETTINGS.batchSize),
    maxConcurrency: chooseOption(settings.maxConcurrency, KEYWORD_REVIEW_CONCURRENCY_OPTIONS, DEFAULT_KEYWORD_REVIEW_SETTINGS.maxConcurrency),
  };
}

export function loadKeywordReviewSettings(): KeywordReviewSettings {
  try {
    const raw = localStorage.getItem(KEYWORD_REVIEW_SETTINGS_STORAGE_KEY);
    return raw ? normalizeKeywordReviewSettings(JSON.parse(raw)) : DEFAULT_KEYWORD_REVIEW_SETTINGS;
  } catch {
    return DEFAULT_KEYWORD_REVIEW_SETTINGS;
  }
}

export function persistKeywordReviewSettings(value: KeywordReviewSettings): boolean {
  try {
    localStorage.setItem(KEYWORD_REVIEW_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeKeywordReviewSettings(value)));
    return true;
  } catch {
    return false;
  }
}
