export type ReviewTokenUsage = {
  cacheHit: number;
  cacheMiss: number;
  completion: number;
};

const EMPTY: ReviewTokenUsage = { cacheHit: 0, cacheMiss: 0, completion: 0 };

export function readTokenUsage(usage: unknown): ReviewTokenUsage {
  const value = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>;
  const details = value.prompt_tokens_details ?? value.input_tokens_details;
  const promptDetails = (details && typeof details === 'object' ? details : {}) as Record<string, unknown>;
  const count = (raw: unknown) => {
    if (typeof raw !== 'number' && typeof raw !== 'string') return 0;
    const number = Number(raw);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  const cacheHit = count(value.prompt_cache_hit_tokens ?? promptDetails.cached_tokens);
  const prompt = count(value.prompt_tokens ?? value.input_tokens);
  const cacheMiss = count(value.prompt_cache_miss_tokens ?? Math.max(0, prompt - cacheHit));
  const completion = count(value.completion_tokens ?? value.output_tokens);
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
  // DeepSeek Flash CNY pricing verified 2026-09-30:
  // https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
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
