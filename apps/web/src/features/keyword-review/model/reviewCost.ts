export type ReviewTokenUsage = {
  cacheHit: number;
  cacheMiss: number;
  completion: number;
};

const EMPTY: ReviewTokenUsage = { cacheHit: 0, cacheMiss: 0, completion: 0 };

export function readTokenUsage(usage: unknown): ReviewTokenUsage {
  const value = (usage || {}) as Record<string, unknown>;
  const promptDetails = (value.prompt_tokens_details || value.input_tokens_details || {}) as Record<string, unknown>;
  const cacheHit = Number(value.prompt_cache_hit_tokens || promptDetails.cached_tokens || 0);
  const prompt = Number(value.prompt_tokens || value.input_tokens || 0);
  const cacheMiss = Number(value.prompt_cache_miss_tokens || Math.max(0, prompt - cacheHit));
  const completion = Number(value.completion_tokens || value.output_tokens || 0);
  return { cacheHit, cacheMiss, completion };
}

export function addTokenUsage(left: ReviewTokenUsage = EMPTY, ...rest: Array<ReviewTokenUsage | undefined>): ReviewTokenUsage {
  return rest.reduce<ReviewTokenUsage>((total, item) => ({
    cacheHit: total.cacheHit + (item?.cacheHit || 0),
    cacheMiss: total.cacheMiss + (item?.cacheMiss || 0),
    completion: total.completion + (item?.completion || 0),
  }), left);
}

/** Weekday Beijing time 09:00-12:00 and 14:00-18:00. Holidays are not excluded. */
export function isDeepSeekPeakHour(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', weekday: 'short', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value || '';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

export function estimateReviewYuan(usage: ReviewTokenUsage, date = new Date()): { yuan: number; peak: boolean } {
  const peak = isDeepSeekPeakHour(date);
  const hit = peak ? 0.04 : 0.02;
  const miss = peak ? 2 : 1;
  const output = peak ? 8 : 4;
  const yuan = usage.cacheHit / 1e6 * hit + usage.cacheMiss / 1e6 * miss + usage.completion / 1e6 * output;
  return { yuan, peak };
}

export function formatReviewYuan(yuan: number): string {
  if (yuan <= 0) return '0';
  return yuan < 0.01 ? '<0.01' : yuan.toFixed(2);
}
