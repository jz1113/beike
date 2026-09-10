import { Semaphore } from '@beike/domain/asyncPool';

export const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];
export const MAX_NETWORK_ATTEMPTS = 3;

export function resolveDeconstructConcurrency(): number {
  const raw = Number(process.env.ASSET_DECONSTRUCT_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.min(20, Math.floor(raw)) : 10;
}

export function resolveMaxInflight(): number {
  const raw = Number(process.env.ASSET_DECONSTRUCT_MAX_INFLIGHT);
  return Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.floor(raw)) : 50;
}

export const visionInflightSemaphore = new Semaphore(resolveMaxInflight());
let consecutiveRateLimitHits = 0;
let rateLimitDecayTimer: ReturnType<typeof setTimeout> | null = null;

export function noteRateLimitHit() {
  consecutiveRateLimitHits++;
  if (rateLimitDecayTimer) clearTimeout(rateLimitDecayTimer);
  rateLimitDecayTimer = setTimeout(() => {
    consecutiveRateLimitHits = Math.max(0, consecutiveRateLimitHits - 1);
  }, 60_000);
}

export function noteRateLimitSuccess() {
  consecutiveRateLimitHits = 0;
}

export function getEffectiveConcurrency(requested: number): number {
  if (consecutiveRateLimitHits === 0) return requested;
  if (consecutiveRateLimitHits >= 3) return 1;
  return Math.max(1, Math.floor(requested / 2));
}

export function parseRetryAfterMs(resp: Response): number | null {
  const header = resp.headers.get('retry-after');
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec > 0) return Math.min(60_000, sec * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const diff = date - Date.now();
    if (diff > 0) return Math.min(60_000, diff);
  }
  return null;
}

export function backoffWithJitter(baseMs: number): number {
  const jitter = 0.5 + Math.random();
  return Math.floor(baseMs * jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitResponse(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  if (status === 400 || status === 500) {
    return /rate[_\s]?limit|too many requests|quota|tpm|rpm/i.test(bodyText);
  }
  return false;
}
